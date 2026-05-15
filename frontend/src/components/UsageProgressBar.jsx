export default function UsageProgressBar({ used = 0, total = 100 }) {
  const safeTotal = Math.max(1, total);
  const percent = Math.min(100, Math.round((used / safeTotal) * 100));
  const barColor = percent >= 100 ? "bg-red-500" : percent >= 80 ? "bg-amber-500" : "bg-indigo-500";

  return (
    <div className="w-full">
      <div className="h-2.5 w-full rounded-full bg-gray-100">
        <div className={`h-2.5 rounded-full transition-all ${barColor}`} style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-1 text-xs text-gray-500">{percent}% used</p>
    </div>
  );
}
