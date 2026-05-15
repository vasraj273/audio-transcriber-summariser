import { useEffect, useState } from "react";
import { getApiMonitoring } from "../../services/admin";
import { friendlyError } from "../../utils/errorMessage";

const STATUS_STYLES = {
  healthy: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500" },
  warning: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500" },
  error: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500" },
};

export default function AdminApiMonitoring() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await getApiMonitoring();
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

  if (loading) return <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading API monitoring…</p>;
  if (error) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">API monitoring</h1>
        <p className="mt-1 text-sm text-gray-500">Last 24 hours, derived from transcript status.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ServiceCard
          name="Groq Llama"
          stats={[
            { label: "Requests today", value: data.groq?.requests_today ?? 0 },
            { label: "Failures today", value: data.groq?.failures_today ?? 0 },
            { label: "Rate-limit hits", value: data.groq?.rate_limit_hits ?? 0 },
          ]}
          status={data.groq?.status || "healthy"}
        />
        <ServiceCard
          name="AssemblyAI"
          stats={[
            { label: "Processed minutes", value: `${data.assemblyai?.processed_minutes ?? 0} min` },
            { label: "Requests today", value: data.assemblyai?.requests_today ?? 0 },
            { label: "Failures today", value: data.assemblyai?.failures_today ?? 0 },
          ]}
          status={data.assemblyai?.status || "healthy"}
        />
      </div>

      <p className="text-xs text-gray-400">
        Note: stats are inferred from `transcripts` rows. Per-token Groq metering and per-second AssemblyAI billing are not currently captured.
      </p>
    </div>
  );
}

function ServiceCard({ name, stats, status }) {
  const styles = STATUS_STYLES[status] || STATUS_STYLES.healthy;
  return (
    <div className={`rounded-xl border ${styles.border} ${styles.bg} p-5`}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">{name}</h2>
        <span className={`inline-flex items-center gap-1.5 rounded-full border ${styles.border} bg-white px-2.5 py-1 text-xs font-semibold ${styles.text}`}>
          <span className={`inline-block h-1.5 w-1.5 rounded-full ${styles.dot}`} />
          {status}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg bg-white px-3 py-2 shadow-sm">
            <dt className="text-xs text-gray-500">{stat.label}</dt>
            <dd className="mt-1 text-base font-semibold text-gray-800">{stat.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
