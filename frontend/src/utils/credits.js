export const CREDIT_RULES = {
  newUserCredits: 100,
  creditsPerMinute: 2,
  warningThreshold: 20,
  resetMode: "daily",
  plan: "free",
};

export function computeRequiredCredits(durationSeconds, rules = CREDIT_RULES) {
  const seconds = Math.max(0, Number(durationSeconds) || 0);
  if (seconds === 0) return 0;
  const minutes = seconds / 60;
  return Math.max(1, Math.ceil(minutes * rules.creditsPerMinute));
}

export function getRemaining(credits) {
  if (!credits) return 0;
  return Math.max(0, (credits.total_credits || 0) - (credits.used_credits || 0));
}

export function isLow(credits, rules = CREDIT_RULES) {
  return getRemaining(credits) <= rules.warningThreshold;
}

export function shouldResetToday(credits, rules = CREDIT_RULES) {
  if (rules.resetMode !== "daily") return false;
  if (!credits?.last_reset_at) return true;
  const last = new Date(credits.last_reset_at);
  const now = new Date();
  return (
    last.getUTCFullYear() !== now.getUTCFullYear() ||
    last.getUTCMonth() !== now.getUTCMonth() ||
    last.getUTCDate() !== now.getUTCDate()
  );
}
