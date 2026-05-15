import { useEffect, useState } from "react";
import { getOverview } from "../../services/admin";
import { friendlyError } from "../../utils/errorMessage";

const CARDS = [
  { key: "total_users", label: "Total users" },
  { key: "active_users_today", label: "Active today" },
  { key: "new_users_this_week", label: "New this week" },
  { key: "total_transcripts", label: "Total transcripts" },
  { key: "completed_transcripts", label: "Completed" },
  { key: "failed_jobs", label: "Failed jobs", tone: "danger" },
  { key: "total_audio_minutes", label: "Audio minutes", suffix: " min" },
  { key: "total_credits_consumed", label: "Credits consumed" },
];

export default function AdminOverview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await getOverview();
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(friendlyError(err.message));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <Skeleton />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return <ErrorBanner message="No data available." />;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Overview</h1>
        <p className="mt-1 text-sm text-gray-500">Live snapshot of platform health and activity.</p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map((card) => (
          <Card
            key={card.key}
            label={card.label}
            value={`${data[card.key] ?? 0}${card.suffix || ""}`}
            tone={card.tone}
          />
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Estimated API usage</p>
        <p className="mt-2 text-2xl font-bold text-gray-900">{data.estimated_api_usage ?? 0} min</p>
        <p className="mt-1 text-xs text-gray-500">
          Aggregate audio minutes processed across all engines. Per-engine breakdown lives in API monitoring.
        </p>
      </div>
    </div>
  );
}

function Card({ label, value, tone }) {
  const toneClass = tone === "danger" ? "border-red-200 bg-red-50" : "border-gray-200 bg-white";
  const valueClass = tone === "danger" ? "text-red-700" : "text-gray-900";
  return (
    <div className={`rounded-xl border p-4 shadow-sm ${toneClass}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${valueClass}`}>{value}</p>
    </div>
  );
}

function Skeleton() {
  return <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading overview…</div>;
}

function ErrorBanner({ message }) {
  return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{message}</div>;
}
