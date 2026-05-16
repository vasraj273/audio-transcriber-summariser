import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  deductCreditsForJob,
  fetchOrCreateUserCredits,
  refundCreditsForJob,
} from "../services/credits";
import { CREDIT_RULES, getRemaining, isLow } from "../utils/credits";

const CreditsContext = createContext(null);

export function CreditsProvider({ userId, children }) {
  const [credits, setCredits] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const deductedRef = useRef(new Map());

  const refresh = useCallback(async () => {
    console.info("[Credits] refresh start", { userId });
    if (!userId) {
      setCredits(null);
      console.info("[Credits] refresh: no userId, cleared state");
      return;
    }
    setLoading(true);
    try {
      const fresh = await fetchOrCreateUserCredits(userId);
      setCredits(fresh);
      setError("");
      console.info("[Credits] refresh complete", {
        total: fresh?.total_credits,
        used: fresh?.used_credits,
        remaining: (fresh?.total_credits || 0) - (fresh?.used_credits || 0),
      });
    } catch (err) {
      setError(err.message);
      console.error("[Credits] refresh failed:", err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const deduct = useCallback(async ({ jobId, recordId, amount }) => {
    console.info("[Credits] deduct called", { userId, jobId, recordId, amount });
    if (!userId) {
      console.warn("[Credits] deduct skipped: no userId in context");
      return null;
    }
    if (!amount || amount <= 0) {
      console.warn("[Credits] deduct skipped: invalid amount", amount);
      return null;
    }
    if (jobId && deductedRef.current.has(jobId)) {
      console.info("[Credits] deduct skipped: session memory already deducted", jobId);
      return { skipped: true, reason: "session_already_deducted" };
    }
    const result = await deductCreditsForJob({ userId, recordId, amount });
    console.info("[Credits] deduct result", { skipped: result?.skipped, reason: result?.reason, new_used: result?.used_credits, new_total: result?.total_credits });
    if (result && !result.skipped) {
      setCredits(result);
      if (jobId) deductedRef.current.set(jobId, { amount, recordId });
      console.info("[Credits] state updated post-deduct", {
        remaining: (result.total_credits || 0) - (result.used_credits || 0),
      });
    }
    return result;
  }, [userId]);

  const refund = useCallback(async ({ jobId, recordId }) => {
    if (!userId) return null;
    const meta = jobId ? deductedRef.current.get(jobId) : null;
    const fallbackAmount = meta?.amount || 0;
    const result = await refundCreditsForJob({ userId, recordId, fallbackAmount });
    if (result) {
      setCredits(result);
      if (jobId) deductedRef.current.delete(jobId);
    }
    return result;
  }, [userId]);

  const value = useMemo(() => ({
    credits,
    loading,
    error,
    remaining: getRemaining(credits),
    used: credits?.used_credits || 0,
    total: credits?.total_credits || CREDIT_RULES.newUserCredits,
    low: isLow(credits),
    refresh,
    deduct,
    refund,
  }), [credits, loading, error, refresh, deduct, refund]);

  return (
    <CreditsContext.Provider value={value}>{children}</CreditsContext.Provider>
  );
}

export function useCredits() {
  const ctx = useContext(CreditsContext);
  if (!ctx) throw new Error("useCredits must be used inside CreditsProvider");
  return ctx;
}
