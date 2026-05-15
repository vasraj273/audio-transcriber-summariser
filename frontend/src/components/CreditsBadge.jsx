import { useCredits } from "../context/CreditsContext";

export default function CreditsBadge() {
  const { remaining, used, total, loading, low, credits } = useCredits();

  if (loading && !credits) {
    return <span className="text-xs text-gray-400">Loading credits…</span>;
  }
  if (!credits) return null;

  const remainingClass = low
    ? "bg-amber-100 text-amber-800 border-amber-200"
    : "bg-indigo-50 text-indigo-700 border-indigo-100";

  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${remainingClass}`}>
        Remaining: {remaining}/{total}
      </span>
      <span className="hidden md:inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-medium text-gray-600">
        Used today: {used}
      </span>
    </div>
  );
}
