export default function SimpleBarChart({ data = [], valueKey = "value", labelKey = "label", height = 140, color = "#6366f1" }) {
  const max = Math.max(1, ...data.map((d) => Number(d[valueKey]) || 0));

  return (
    <div className="w-full">
      <div className="flex items-end gap-2 overflow-x-auto pb-2" style={{ height }}>
        {data.map((row, idx) => {
          const value = Number(row[valueKey]) || 0;
          const heightPct = (value / max) * 100;
          return (
            <div key={idx} className="flex min-w-[28px] flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-1 items-end">
                <div
                  title={`${row[labelKey]}: ${value}`}
                  className="w-full rounded-t"
                  style={{ height: `${heightPct}%`, backgroundColor: color, minHeight: value > 0 ? "2px" : "0" }}
                />
              </div>
              <span className="text-[10px] text-gray-500">{row[labelKey]?.slice ? row[labelKey].slice(5) : row[labelKey]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HorizontalPercentBars({ data = [], valueKey = "count", labelKey = "label", color = "#6366f1" }) {
  const total = data.reduce((acc, d) => acc + (Number(d[valueKey]) || 0), 0) || 1;
  return (
    <ul className="space-y-2">
      {data.map((row, idx) => {
        const value = Number(row[valueKey]) || 0;
        const pct = Math.round((value / total) * 100);
        return (
          <li key={idx}>
            <div className="flex justify-between text-xs text-gray-600">
              <span className="font-medium text-gray-800 truncate max-w-[60%]">{row[labelKey]}</span>
              <span>{pct}% · {value}</span>
            </div>
            <div className="mt-1 h-2 w-full rounded-full bg-gray-100">
              <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
