import { useEffect, useState } from "react";
import Navbar from "../components/Navbar";
import UsageStatCard from "../components/UsageStatCard";
import UsageProgressBar from "../components/UsageProgressBar";
import { useCredits } from "../context/CreditsContext";
import { getUserAnalytics } from "../services/analytics";
import { CREDIT_RULES } from "../utils/credits";

export default function UsagePage({ session }) {
  const { remaining, used, total, low, credits } = useCredits();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await getUserAnalytics(session.user.id);
        if (!cancelled) setAnalytics(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [session.user.id]);

  const plan = credits?.plan || CREDIT_RULES.plan;
  const isEmpty = remaining === 0;
  const banner = isEmpty
    ? { tone: "danger", message: "No credits remaining. Wait for the daily reset or upgrade your plan." }
    : low
    ? { tone: "warning", message: "You're running low on credits." }
    : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar session={session} />

      <main className="mx-auto max-w-5xl px-4 pb-10 sm:px-6">
        <div className="sticky top-[61px] z-40 -mx-4 mb-6 border-b border-gray-200 bg-gray-50/95 px-4 py-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-gray-50/85 sm:-mx-6 sm:px-6">
          <h1 className="text-2xl font-bold text-gray-800">Usage & Activity</h1>
          <p className="text-gray-500 mt-1 text-sm">Track your credits, transcripts, and recent processing.</p>
        </div>

        {banner && (
          <div className={`mb-6 rounded-xl border p-4 text-sm ${
            banner.tone === "danger"
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-amber-200 bg-amber-50 text-amber-800"
          }`}>
            {banner.message}
          </div>
        )}

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Credits</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <UsageStatCard
              label="Remaining"
              value={`${remaining} / ${total}`}
              tone={isEmpty ? "danger" : low ? "warning" : "default"}
            />
            <UsageStatCard label="Used today" value={used} />
            <UsageStatCard label="Total plan credits" value={total} />
            <UsageStatCard label="Plan" value={plan ? plan.charAt(0).toUpperCase() + plan.slice(1) : "Free"} />
          </div>
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Daily usage</p>
            <div className="mt-2">
              <UsageProgressBar used={used} total={total} />
            </div>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Lifetime activity</h2>
          {loading ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading activity…</div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <UsageStatCard label="Total transcripts" value={analytics?.totalJobs ?? 0} />
              <UsageStatCard label="Completed" value={analytics?.completedJobs ?? 0} />
              <UsageStatCard label="Failed jobs" value={analytics?.failedJobs ?? 0} />
              <UsageStatCard label="Audio minutes processed" value={analytics?.totalMinutes ?? 0} />
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Recent transcripts</h2>
          {loading ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading…</div>
          ) : !analytics?.recent?.length ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
              No completed transcripts yet. Upload audio from the Transcribe page to get started.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white shadow-sm">
              {analytics.recent.map((record) => {
                const date = new Date(record.created_at).toLocaleDateString("en-GB", {
                  day: "numeric", month: "short", year: "numeric",
                });
                const minutes = Math.max(0, Math.round((record.duration_seconds || 0) / 60));
                return (
                  <li key={record.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-800 truncate">{record.audio_name || "Untitled"}</p>
                      <p className="text-xs text-gray-400">{date}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">{minutes} min</span>
                      <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700 border border-indigo-100">{record.credits_used || 0} credits</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
