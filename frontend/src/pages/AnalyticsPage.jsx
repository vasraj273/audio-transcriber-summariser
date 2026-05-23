import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { fetchKpiSnapshot, fetchAllTasks } from "../services/supabase";
import { friendlyError } from "../utils/errorMessage";

const FUNNEL_TONE = {
  lead: "bg-ink-200",
  contacted: "bg-brand-300",
  demo: "bg-brand-400",
  negotiation: "bg-warning-500",
  won: "bg-success-500",
  lost: "bg-danger-500",
};

const TEMP_PILL = {
  cold: "pill-brand",
  warm: "pill-warn",
  hot: "pill-danger",
};

const KIND_PILL = {
  call: "pill-brand",
  task: "pill-warn",
  lead: "pill-success",
};

export default function AnalyticsPage({ session, embedded = false }) {
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    load();
  }, [session?.user?.id]);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const [snap, tks] = await Promise.all([
        fetchKpiSnapshot({ userId: session.user.id, periodStart: null, periodEnd: null }),
        fetchAllTasks(session.user.id),
      ]);
      setSnapshot(snap);
      setTasks(tks);
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setLoading(false);
    }
  }

  const m = snapshot?.metrics;
  const funnel = snapshot?.funnel;
  const sentiment = snapshot?.sentimentBreakdown;
  const calls = snapshot?.calls || [];
  const leads = snapshot?.leads || [];

  const callQuality = useMemo(() => {
    if (calls.length === 0) return 0;
    return Math.round(calls.reduce((sum, c) => sum + (c.lead_score || 0), 0) / calls.length);
  }, [calls]);

  const topLeads = useMemo(() => {
    return [...leads]
      .filter((l) => !["won", "lost"].includes(l.status))
      .sort((a, b) => (b.lead_score || 0) - (a.lead_score || 0))
      .slice(0, 5);
  }, [leads]);

  const recentActivity = useMemo(() => {
    const callEvents = calls.map((c) => ({
      kind: "call",
      id: `call-${c.id}`,
      at: c.created_at,
      label: `Call analysed${c.customer_name ? ` · ${c.customer_name}` : ""}${c.company ? ` (${c.company})` : ""}`,
      meta: { sentiment: c.sentiment, score: c.lead_score },
    }));
    const taskEvents = tasks.map((t) => ({
      kind: "task",
      id: `task-${t.id}`,
      at: t.created_at,
      label: t.description,
      meta: { type: t.task_type, status: t.status },
    }));
    const leadEvents = leads.map((l) => ({
      kind: "lead",
      id: `lead-${l.id}`,
      at: l.created_at,
      label: `Lead saved · ${l.lead_name || "Unknown"}${l.company ? ` (${l.company})` : ""}`,
      meta: { temperature: l.lead_temperature, score: l.lead_score },
    }));
    return [...callEvents, ...taskEvents, ...leadEvents]
      .filter((e) => e.at)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 12);
  }, [calls, tasks, leads]);

  const last30 = useMemo(() => buildDailyCounts(calls, 30), [calls]);
  const funnelMax = useMemo(() => {
    if (!funnel) return 0;
    return Math.max(...Object.values(funnel), 1);
  }, [funnel]);

  const content = (
    <main className={embedded ? "min-w-0" : "app-container pb-12"}>
      <PageHeader
        eyebrow="Overview"
        title="Analytics"
        subtitle="All-time intelligence across calls, leads, and tasks."
        actions={
          <button onClick={load} className="btn btn-secondary">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M4 20l5-5M20 4l-5 5" />
            </svg>
            Refresh
          </button>
        }
      />

      {error && <ErrorBanner message={error} />}

      {loading || !m ? (
        <SkeletonRow />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 rise">
            <StatCard
              label="Total Calls"
              value={m.callsCompleted}
              note="All-time analysed"
              icon={
                <path d="M22 16.92V19.92C22.0011 20.1985 21.9441 20.4742 21.8325 20.7293C21.7209 20.9845 21.5573 21.2136 21.3521 21.4019C21.1468 21.5901 20.9046 21.7335 20.6407 21.8227C20.3769 21.9119 20.0974 21.9451 19.82 21.92C16.7428 21.5856 13.787 20.5341 11.19 18.85C8.77383 17.3147 6.72534 15.2662 5.18999 12.85C3.49997 10.2412 2.44824 7.27097 2.11999 4.18C2.09494 3.90347 2.12781 3.62476 2.21643 3.36162C2.30506 3.09849 2.4475 2.85669 2.6347 2.65162C2.82189 2.44655 3.04969 2.28271 3.30372 2.17052C3.55775 2.05833 3.83249 2.00026 4.10999 2H7.10999C7.59522 1.99522 8.06574 2.16708 8.43373 2.48353C8.80171 2.79999 9.04207 3.23945 9.10999 3.72C9.23662 4.68007 9.47144 5.62273 9.80999 6.53C9.94454 6.88792 9.97366 7.27675 9.8939 7.65058C9.81415 8.02441 9.62886 8.36734 9.35999 8.64L8.08999 9.91C9.51354 12.4135 11.5865 14.4865 14.09 15.91L15.36 14.64C15.6326 14.3711 15.9756 14.1858 16.3494 14.1061C16.7232 14.0263 17.1121 14.0555 17.47 14.19C18.3773 14.5286 19.3199 14.7634 20.28 14.89C20.7658 14.9585 21.2094 15.2032 21.5265 15.5775C21.8437 15.9518 22.0122 16.4296 22 16.92Z" strokeLinecap="round" strokeLinejoin="round" />
              }
            />
            <StatCard
              label="Conversion"
              value={`${m.conversionRate}%`}
              note={`${m.wonLeads} won · ${m.lostLeads} lost`}
              tone={m.conversionRate >= 50 ? "success" : m.conversionRate >= 25 ? "warn" : "danger"}
              icon={
                <path d="M3 17L9 11L13 15L21 7M21 7H15M21 7V13" strokeLinecap="round" strokeLinejoin="round" />
              }
              onClick={() => navigate("/sales-assistant/kpi")}
            />
            <StatCard
              label="Call Quality"
              value={callQuality}
              note="Avg lead score from calls"
              tone={callQuality >= 70 ? "success" : callQuality >= 40 ? "warn" : "danger"}
              icon={
                <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" strokeLinecap="round" strokeLinejoin="round" />
              }
            />
            <StatCard
              label="Won Deals"
              value={m.wonLeads}
              note="Closed positive"
              tone="success"
              icon={
                <path d="M22 11.08V12C21.9988 14.1564 21.3005 16.2547 20.0093 17.9818C18.7182 19.709 16.9033 20.9725 14.8354 21.5839C12.7674 22.1953 10.5573 22.1219 8.53447 21.3746C6.51168 20.6273 4.78465 19.246 3.61096 17.4371C2.43727 15.6281 1.87979 13.4882 2.02168 11.3364C2.16356 9.18467 2.99721 7.13643 4.39828 5.49718C5.79935 3.85793 7.69279 2.71549 9.79619 2.24025C11.8996 1.76502 14.1003 1.98245 16.07 2.86M22 4L12 14.01L9 11.01" strokeLinecap="round" strokeLinejoin="round" />
              }
              onClick={() => navigate("/sales-assistant/leads")}
            />
          </div>

          {/* Sparkline */}
          <div className="card p-6 mb-6 rise rise-1">
            <div className="flex items-center justify-between mb-5">
              <div>
                <p className="eyebrow">Calls volume</p>
                <p className="h-section mt-1">Last 30 days</p>
              </div>
              <div className="text-right">
                <p className="num text-2xl">{last30.total}</p>
                <p className="text-[12px] text-ink-500">{(last30.total / 30).toFixed(1)} avg / day</p>
              </div>
            </div>
            <Sparkline points={last30.counts} />
            <div className="flex items-center justify-between text-[11px] text-ink-400 mt-3 font-mono">
              <span>{last30.startLabel}</span>
              <span>{last30.endLabel}</span>
            </div>
          </div>

          {/* Funnel + Sentiment */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6 rise rise-2">
            <div className="card p-6 lg:col-span-2">
              <PanelHead
                title="Pipeline funnel"
                subtitle="Distribution of leads by stage"
                action={
                  <button
                    onClick={() => navigate("/sales-assistant/leads")}
                    className="btn btn-ghost"
                  >
                    View leads
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                }
              />
              <div className="space-y-3.5">
                {["lead", "contacted", "demo", "negotiation", "won", "lost"].map((stage) => {
                  const count = funnel?.[stage] || 0;
                  const pct = funnelMax > 0 ? Math.round((count / funnelMax) * 100) : 0;
                  return (
                    <div key={stage} className="grid grid-cols-[100px_1fr_40px] items-center gap-3">
                      <span className="text-[12.5px] font-medium text-ink-700 capitalize">{stage}</span>
                      <div className="h-2.5 bg-ink-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${FUNNEL_TONE[stage]}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="num text-[13.5px] text-right">{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card p-6">
              <PanelHead title="Call sentiment" />
              {calls.length === 0 ? (
                <p className="text-sm text-ink-400">No calls analysed yet.</p>
              ) : (
                <ul className="space-y-4">
                  {[
                    { k: "positive", color: "bg-success-500", label: "Positive" },
                    { k: "neutral", color: "bg-ink-400", label: "Neutral" },
                    { k: "negative", color: "bg-danger-500", label: "Negative" },
                  ].map(({ k, color, label }) => {
                    const count = sentiment?.[k] || 0;
                    const pct = calls.length > 0 ? Math.round((count / calls.length) * 100) : 0;
                    return (
                      <li key={k}>
                        <div className="flex items-baseline justify-between mb-1.5">
                          <span className="text-[12.5px] font-medium text-ink-700">{label}</span>
                          <span className="text-[12px] text-ink-500">
                            <span className="num text-ink-900">{count}</span> · {pct}%
                          </span>
                        </div>
                        <div className="h-2 bg-ink-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Top Leads */}
          <div className="grid grid-cols-1 mb-6 rise rise-3">
            <div className="card p-6">
              <PanelHead
                title="Top open leads"
                subtitle="Ranked by score"
                action={
                  <button
                    onClick={() => navigate("/sales-assistant/leads")}
                    className="btn btn-ghost"
                  >
                    All leads
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                    </svg>
                  </button>
                }
              />
              {topLeads.length === 0 ? (
                <EmptyMini message="No open leads." />
              ) : (
                <ul className="divide-y divide-ink-100 -mx-2">
                  {topLeads.map((l, i) => (
                    <li key={l.id} className="flex items-center justify-between gap-3 px-2 py-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="grid place-items-center w-8 h-8 rounded-full bg-ink-100 text-[11px] font-semibold text-ink-600">
                          {(l.lead_name || "?").slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[13.5px] text-ink-900 truncate font-medium">
                            {l.lead_name || "Unknown"}
                          </p>
                          <p className="text-[11.5px] text-ink-500 truncate">
                            {l.company || "—"} · {l.status}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 flex items-center gap-3">
                        <span className={`pill ${TEMP_PILL[l.lead_temperature]} uppercase text-[10px]`}>
                          {l.lead_temperature}
                        </span>
                        <span className="num text-[15px]">{l.lead_score}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Activity */}
          <div className="card p-6 mb-6 rise rise-4">
            <PanelHead title="Recent activity" subtitle="Calls, leads, and tasks across the workspace" />
            {recentActivity.length === 0 ? (
              <EmptyMini message="No activity yet." />
            ) : (
              <ul className="divide-y divide-ink-100 -mx-2">
                {recentActivity.map((event) => (
                  <li key={event.id} className="flex items-start gap-4 px-2 py-3">
                    <span className={`pill ${KIND_PILL[event.kind]} uppercase text-[10px] flex-shrink-0`}>
                      {event.kind}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] text-ink-900">{event.label}</p>
                      <p className="text-[11.5px] text-ink-500 mt-0.5 font-mono">
                        {new Date(event.at).toLocaleString()}{metaLine(event)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
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

/* ---------- Shared building blocks (exported) ---------- */

export function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pt-8 pb-6 mb-6 border-b border-ink-200">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="h-display text-[28px] sm:text-[32px] mt-1.5">{title}</h1>
        {subtitle && (
          <p className="text-[13.5px] text-ink-500 mt-2 max-w-xl">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function ErrorBanner({ message }) {
  return (
    <div className="mb-5 card-tight bg-danger-50 border-danger-500/20 px-4 py-3 flex items-center gap-3">
      <span className="grid place-items-center w-7 h-7 rounded-full bg-danger-500/15 text-danger-600">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      </span>
      <p className="text-[13.5px] text-danger-600">{message}</p>
    </div>
  );
}

export function PanelHead({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div>
        <p className="h-section">{title}</p>
        {subtitle && <p className="text-[12.5px] text-ink-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyMini({ message }) {
  return <p className="text-sm text-ink-400 py-2">{message}</p>;
}

/* ---------- Local components ---------- */

function StatCard({ label, value, note, tone, icon, onClick }) {
  const TONE = {
    success: "text-success-600",
    danger: "text-danger-600",
    warn: "text-warning-600",
  };
  const clickable = typeof onClick === "function";
  return (
    <button
      onClick={clickable ? onClick : undefined}
      disabled={!clickable}
      className={`card p-5 text-left card-hover ${clickable ? "cursor-pointer" : "cursor-default"}`}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="eyebrow">{label}</p>
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-ink-50 border border-ink-100 text-ink-700">
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            {icon}
          </svg>
        </span>
      </div>
      <p className={`num text-[34px] leading-none ${TONE[tone] || "text-ink-900"}`}>{value}</p>
      {note && <p className="text-[12px] text-ink-500 mt-2">{note}</p>}
    </button>
  );
}

function Sparkline({ points }) {
  if (!points || points.length === 0) {
    return <p className="text-sm text-ink-400">No data.</p>;
  }
  const max = Math.max(...points, 1);
  const width = 600;
  const height = 80;
  const step = width / Math.max(points.length - 1, 1);
  const path = points
    .map((p, i) => {
      const x = i * step;
      const y = height - (p / max) * (height - 8) - 4;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPath = `${path} L ${width} ${height} L 0 ${height} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-24">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#spark-fill)" />
      <path d={path} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function SkeletonRow() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="card p-5 h-[140px] animate-pulse">
          <div className="h-3 w-20 bg-ink-100 rounded mb-4" />
          <div className="h-7 w-24 bg-ink-100 rounded" />
        </div>
      ))}
    </div>
  );
}

function buildDailyCounts(calls, days) {
  const buckets = {};
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    buckets[d.toISOString().slice(0, 10)] = 0;
  }
  for (const c of calls) {
    if (!c.created_at) continue;
    const key = String(c.created_at).slice(0, 10);
    if (buckets[key] != null) buckets[key] += 1;
  }
  const keys = Object.keys(buckets);
  const counts = keys.map((k) => buckets[k]);
  return {
    counts,
    total: counts.reduce((s, n) => s + n, 0),
    startLabel: keys[0],
    endLabel: keys[keys.length - 1],
  };
}

function metaLine(event) {
  if (event.kind === "call") {
    const parts = [];
    if (event.meta?.sentiment) parts.push(event.meta.sentiment);
    if (event.meta?.score != null) parts.push(`score ${event.meta.score}`);
    return parts.length ? ` · ${parts.join(" · ")}` : "";
  }
  if (event.kind === "task") {
    const parts = [];
    if (event.meta?.type) parts.push(event.meta.type);
    if (event.meta?.status) parts.push(event.meta.status);
    return parts.length ? ` · ${parts.join(" · ")}` : "";
  }
  if (event.kind === "lead") {
    const parts = [];
    if (event.meta?.temperature) parts.push(event.meta.temperature);
    if (event.meta?.score != null) parts.push(`score ${event.meta.score}`);
    return parts.length ? ` · ${parts.join(" · ")}` : "";
  }
  return "";
}
