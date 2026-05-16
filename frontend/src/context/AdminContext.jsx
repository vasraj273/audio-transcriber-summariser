import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { checkAdmin } from "../services/admin";

const AdminContext = createContext(null);

export function AdminProvider({ userId, children }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);

  const refresh = useCallback(async () => {
    console.info("[AdminCtx] refresh fired", { userId });
    if (!userId) {
      setIsAdmin(false);
      setChecked(true);
      setLoading(false);
      console.info("[AdminCtx] no userId -> isAdmin=false, checked=true");
      return;
    }
    setLoading(true);
    setChecked(false);
    try {
      const result = await checkAdmin(userId);
      setIsAdmin(Boolean(result));
      console.info("[AdminCtx] check complete", { userId, isAdmin: Boolean(result) });
    } catch (err) {
      console.error("[AdminCtx] check threw:", err?.message || err);
      setIsAdmin(false);
    } finally {
      setLoading(false);
      setChecked(true);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(() => ({ isAdmin, loading, checked, refresh }), [isAdmin, loading, checked, refresh]);
  return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdmin() {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside AdminProvider");
  return ctx;
}
