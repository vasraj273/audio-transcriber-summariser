import { useEffect, useState } from "react";
import { getAnalytics } from "../../services/admin";
import SimpleBarChart, { HorizontalPercentBars } from "./SimpleBarChart";
import { friendlyError } from "../../utils/errorMessage";

export default function AdminAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await getAnalytics();
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

  if (loading) return <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading analytics…</p>;
  if (error) return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Analytics</h1>
        <p className="mt-1 text-sm text-gray-500">Last 14 days · daily trends and content mix.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <ChartCard title="Daily uploads">
          <SimpleBarChart data={data.daily || []} valueKey="uploads" labelKey="date" color="#6366f1" />
        </ChartCard>
        <ChartCard title="Daily audio minutes">
          <SimpleBarChart data={data.daily || []} valueKey="minutes" labelKey="date" color="#0ea5e9" />
        </ChartCard>
        <ChartCard title="Daily credits used">
          <SimpleBarChart data={data.daily || []} valueKey="credits_used" labelKey="date" color="#f59e0b" />
        </ChartCard>
        <ChartCard title="Daily active users">
          <SimpleBarChart data={data.daily || []} valueKey="active_users" labelKey="date" color="#10b981" />
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ChartCard title="Language distribution">
          {data.languages?.length ? (
            <HorizontalPercentBars data={data.languages} color="#6366f1" />
          ) : (
            <Empty />
          )}
        </ChartCard>
        <ChartCard title="Audio type distribution">
          {data.audio_types?.length ? (
            <HorizontalPercentBars data={data.audio_types} color="#0ea5e9" />
          ) : (
            <Empty />
          )}
        </ChartCard>
        <ChartCard title="Provider mix">
          {data.providers?.length ? (
            <HorizontalPercentBars data={data.providers} color="#8b5cf6" />
          ) : (
            <Empty />
          )}
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Empty() {
  return <p className="py-6 text-center text-sm text-gray-400">No data yet.</p>;
}
