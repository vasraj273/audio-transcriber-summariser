import { useEffect, useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import { fetchKpiSnapshot } from "../services/supabase";
import { friendlyError } from "../utils/errorMessage";
import { PageHeader, ErrorBanner, PanelHead } from "./AnalyticsPage";

const RANGE_OPTIONS = [
  { key: "7d", label: "7d", days: 7 },
  { key: "30d", label: "30d", days: 30 },
  { key: "90d", label: "90d", days: 90 },
  { key: "ytd", label: "YTD", custom: "ytd" },
  { key: "all", label: "All", days: null },
];

const FUNNEL_TONE = {
  lead: "bg-ink-200",
  contacted: "bg-brand-300",
  demo: "bg-brand-400",
  negotiation: "bg-warning-500",
  won: "bg-success-500",
  lost: "bg-danger-500",
};

export default function KPIPage({ session, embedded = false }) {
  const [rangeKey, setRangeKey] = useState("30d");
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    load();
  }, [session?.user?.id, rangeKey]);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const { periodStart, periodEnd } = computeRange(rangeKey);
      const data = await fetchKpiSnapshot({ userId: session.user.id, periodStart, periodEnd });
      setSnapshot(data);
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setLoading(false);
    }
  }

  const m = snapshot?.metrics;
  const funnel = snapshot?.funnel;
  const sentiment = snapshot?.sentimentBreakdown;
  const funnelMax = useMemo(() => {
    if (!funnel) return 0;
    return Math.max(...Object.values(funnel), 1);
  }, [funnel]);

  const content = (
    <main className={embedded ? "min-w-0" : "app-container pb-12"}>
      <PageHeader
        eyebrow="Performance"
        title="KPIs"
        subtitle="Auto-tracked from your sales calls, leads, and tasks."
        actions={
          <div className="inline-flex p-1 rounded-xl bg-ink-100">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setRangeKey(opt.key)}
                className={`px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-all ${
                  rangeKey === opt.key
                    ? "bg-white text-ink-900 shadow-sm"
                    : "text-ink-500 hover:text-ink-900"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        }
      />

      {error && <ErrorBanner message={error} />}

      {loading || !m ? (
        <p className="text-sm text-ink-400">Loading KPIs…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-6 rise">
            <Kpi label="Calls completed" value={m.callsCompleted} />
            <Kpi label="Total leads" value={m.totalLeads} tone="brand" />
            <Kpi label="Hot leads" value={m.hotLeads} tone="danger" />
            <Kpi label="Meetings booked" value={m.meetingsBooked} />
            <Kpi label="Proposals sent" value={m.proposalsSent} />
            <Kpi label="Won deals" value={m.wonLeads} tone="success" />
            <Kpi
              label="Conversion rate"
              value={`${m.conversionRate}%`}
              tone={m.conversionRate >= 50 ? "success" : m.conversionRate >= 25 ? "warn" : "danger"}
              hint={`${m.wonLeads} won of ${m.wonLeads + m.lostLeads} closed`}
            />
            <Kpi
              label="Avg lead score"
              value={m.avgLeadScore}
              tone={m.avgLeadScore >= 70 ? "success" : m.avgLeadScore >= 40 ? "warn" : "danger"}
              hint={tempLabel(m.avgLeadScore)}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6 rise rise-1">
            <div className="card p-6 lg:col-span-2">
              <PanelHead title="Pipeline funnel" subtitle="Distribution of leads by stage" />
              <div className="space-y-3.5">
                {["lead", "contacted", "demo", "negotiation", "won", "lost"].map((stage) => {
                  const count = funnel?.[stage] || 0;
                  const pct = funnelMax > 0 ? Math.round((count / funnelMax) * 100) : 0;
                  return (
                    <div key={stage} className="grid grid-cols-[100px_1fr_40px] items-center gap-3">
                      <span className="text-[12.5px] font-medium text-ink-700 capitalize">{stage}</span>
                      <div className="h-2.5 bg-ink-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${FUNNEL_TONE[stage]}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span className="num text-[13.5px] text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card p-6">
              <PanelHead title="Call sentiment" />
              <ul className="space-y-4">
                {[
                  { k: "positive", color: "bg-success-500", label: "Positive" },
                  { k: "neutral", color: "bg-ink-400", label: "Neutral" },
                  { k: "negative", color: "bg-danger-500", label: "Negative" },
                ].map(({ k, color, label }) => {
                  const count = sentiment?.[k] || 0;
                  const total = snapshot.calls.length;
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                  return (
                    <li key={k}>
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-[12.5px] font-medium text-ink-700">{label}</span>
                        <span className="text-[12px] text-ink-500"><span className="num text-ink-900">{count}</span> · {pct}%</span>
                      </div>
                      <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="text-[11.5px] text-ink-400 mt-4">Across {snapshot.calls.length} analysed calls.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 rise rise-2">
            <div className="card p-6">
              <PanelHead title="Task health" />
              <Row label="Open" value={m.openTasks} />
              <Row label="Overdue" value={m.overdueTasks} tone={m.overdueTasks > 0 ? "danger" : null} />
              <Row label="Completed" value={m.completedTasks} tone="success" last />
            </div>
            <div className="card p-6">
              <PanelHead title="Lead temperature" />
              <Row label="Hot" value={m.hotLeads} tone="danger" />
              <Row label="Warm" value={m.warmLeads} tone="warn" />
              <Row label="Cold" value={m.coldLeads} tone="brand" last />
            </div>
          </div>
        </>
      )}
    </main>
  );

  if (embedded) return content;
  return (
    <div className="min-h-screen bg-ink-50">
      <Navbar session={session} />
      {content}
    </div>
  );
}

function Kpi({ label, value, tone, hint }) {
  const TONE = {
    success: "text-success-600",
    danger: "text-danger-600",
    warn: "text-warning-600",
    brand: "text-brand-600",
  };
  return (
    <div className="card p-5">
      <p className="eyebrow">{label}</p>
      <p className={`num text-[32px] leading-none mt-2 ${TONE[tone] || "text-ink-900"}`}>{value}</p>
      {hint && <p className="text-[12px] text-ink-500 mt-2">{hint}</p>}
    </div>
  );
}

function Row({ label, value, tone, last }) {
  const TONE = {
    danger: "text-danger-600",
    success: "text-success-600",
    warn: "text-warning-600",
    brand: "text-brand-600",
  };
  return (
    <div className={`flex items-center justify-between py-3 ${last ? "" : "border-b border-ink-100"}`}>
      <span className="text-[13.5px] text-ink-700">{label}</span>
      <span className={`num text-lg ${TONE[tone] || "text-ink-900"}`}>{value}</span>
    </div>
  );
}

function tempLabel(score) {
  if (score >= 71) return "Hot zone";
  if (score >= 31) return "Warm zone";
  return "Cold zone";
}

function computeRange(key) {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  if (key === "all") return { periodStart: null, periodEnd: null };
  if (key === "ytd") {
    return { periodStart: `${today.getFullYear()}-01-01`, periodEnd: end };
  }
  const option = RANGE_OPTIONS.find((o) => o.key === key);
  if (!option || !option.days) return { periodStart: null, periodEnd: null };
  const start = new Date(today);
  start.setDate(start.getDate() - option.days);
  return { periodStart: start.toISOString().slice(0, 10), periodEnd: end };
}
