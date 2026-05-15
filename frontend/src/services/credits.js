import { supabase } from "./supabase";
import { CREDIT_RULES, shouldResetToday } from "../utils/credits";

export function defaultCreditsRecord(userId) {
  const now = new Date().toISOString();
  return {
    user_id: userId,
    total_credits: CREDIT_RULES.newUserCredits,
    used_credits: 0,
    last_reset_at: now,
    plan: CREDIT_RULES.plan,
    created_at: now,
    updated_at: now,
  };
}

export async function ensureUserCreditsRow(userId) {
  if (!userId) return false;
  const upsert = await supabase
    .from("user_credits")
    .upsert(
      {
        user_id: userId,
        total_credits: CREDIT_RULES.newUserCredits,
        used_credits: 0,
        plan: CREDIT_RULES.plan,
      },
      { onConflict: "user_id", ignoreDuplicates: true }
    );
  if (upsert.error) {
    if (/duplicate key|unique constraint|23505/i.test(upsert.error.message)) return true;
    console.error("[Credits] ensureUserCreditsRow failed:", upsert.error.message);
    return false;
  }
  return true;
}

export async function fetchOrCreateUserCredits(userId) {
  if (!userId) return null;
  await ensureUserCreditsRow(userId);

  const fresh = await supabase
    .from("user_credits")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (fresh.error || !fresh.data) {
    console.error(
      "[Credits] falling back to default record:",
      fresh.error?.message || "no row returned after upsert"
    );
    return defaultCreditsRecord(userId);
  }

  let record = fresh.data;
  if (shouldResetToday(record)) {
    const now = new Date().toISOString();
    const reset = await supabase
      .from("user_credits")
      .update({ used_credits: 0, last_reset_at: now, updated_at: now })
      .eq("user_id", userId)
      .select()
      .single();
    if (!reset.error && reset.data) record = reset.data;
  }
  return record;
}

export async function deductCreditsForJob({ userId, recordId, amount }) {
  if (!userId || !amount || amount <= 0) return null;

  if (recordId) {
    const guard = await supabase
      .from("transcripts")
      .select("credits_used")
      .eq("id", recordId)
      .maybeSingle();
    if (!guard.error && guard.data && (guard.data.credits_used || 0) > 0) {
      return { skipped: true, reason: "already_deducted" };
    }
    if (guard.error) {
      console.warn(
        "[Credits] transcripts.credits_used guard unavailable, proceeding without DB idempotency stamp:",
        guard.error.message
      );
    }
  }

  await ensureUserCreditsRow(userId);

  const current = await supabase
    .from("user_credits")
    .select("used_credits, total_credits")
    .eq("user_id", userId)
    .maybeSingle();

  if (current.error || !current.data) {
    console.error(
      "[Credits] could not read user_credits row, skipping deduction:",
      current.error?.message || "row missing after upsert"
    );
    return { skipped: true, reason: "row_unavailable" };
  }

  const usedNow = current.data.used_credits || 0;
  const totalNow = current.data.total_credits || 0;
  if (usedNow + amount > totalNow) {
    throw new Error("Insufficient credits remaining.");
  }

  const update = await supabase
    .from("user_credits")
    .update({ used_credits: usedNow + amount, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select()
    .single();
  if (update.error || !update.data) {
    throw new Error(`Failed to persist credit deduction: ${update.error?.message || "no row returned"}`);
  }

  if (recordId) {
    const mark = await supabase
      .from("transcripts")
      .update({ credits_used: amount })
      .eq("id", recordId);
    if (mark.error) {
      console.warn("[Credits] Could not stamp credits_used (non-fatal):", mark.error.message);
    }
  }

  return update.data;
}

export async function refundCreditsForJob({ userId, recordId, fallbackAmount = 0 }) {
  if (!userId) return null;

  let amount = 0;
  let alreadyRefunded = false;

  if (recordId) {
    const record = await supabase
      .from("transcripts")
      .select("credits_used, credits_refunded")
      .eq("id", recordId)
      .maybeSingle();
    if (!record.error && record.data) {
      if (record.data.credits_refunded) {
        alreadyRefunded = true;
      } else {
        amount = record.data.credits_used || 0;
      }
    } else if (record.error) {
      console.warn(
        "[Credits] refund lookup unavailable, will use fallback amount:",
        record.error.message
      );
    }
  }

  if (alreadyRefunded) return null;
  if (amount <= 0) amount = fallbackAmount;
  if (amount <= 0) return null;

  await ensureUserCreditsRow(userId);

  const current = await supabase
    .from("user_credits")
    .select("used_credits")
    .eq("user_id", userId)
    .maybeSingle();
  if (current.error || !current.data) {
    console.error("[Credits] refund balance read failed:", current.error?.message);
    return null;
  }

  const usedNow = current.data.used_credits || 0;
  const newUsed = Math.max(0, usedNow - amount);

  const update = await supabase
    .from("user_credits")
    .update({ used_credits: newUsed, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select()
    .single();
  if (update.error) {
    console.error("[Credits] refund deduction failed:", update.error.message);
    return null;
  }

  if (recordId) {
    const mark = await supabase
      .from("transcripts")
      .update({ credits_refunded: true })
      .eq("id", recordId);
    if (mark.error) console.warn("[Credits] Could not mark refund (non-fatal):", mark.error.message);
  }

  return update.data;
}
