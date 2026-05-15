export default function UsageStatCard({ label, value, sublabel, tone = "default" }) {
  const toneClass = tone === "warning"
    ? "border-amber-200 bg-amber-50"
    : tone === "danger"
    ? "border-red-200 bg-red-50"
    : "border-gray-200 bg-white";
  const valueClass = tone === "warning"
    ? "text-amber-800"
    : tone === "danger"
    ? "text-red-700"
    : "text-gray-900";

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${valueClass}`}>{value}</p>
      {sublabel && <p className="mt-1 text-xs text-gray-500">{sublabel}</p>}
    </div>
  );
}
