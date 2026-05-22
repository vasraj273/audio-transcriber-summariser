import { useState } from "react";

const TEMP_PILL = {
  cold: "pill-brand",
  warm: "pill-warn",
  hot: "pill-danger",
};

const SENTIMENT_PILL = {
  positive: "pill-success",
  neutral: "pill-neutral",
  negative: "pill-danger",
};

const URGENCY_PILL = {
  high: "pill-danger",
  medium: "pill-warn",
  low: "pill-success",
  unknown: "pill-neutral",
};

export default function SalesAnalysisPanel({ analysis, onCreateLead }) {
  const [open, setOpen] = useState(true);

  if (!analysis) return null;

  const {
    customerName,
    company,
    painPoints = [],
    budget,
    urgency = "unknown",
    timeline,
    competitors = [],
    sentiment = "neutral",
    objections = [],
    requirements = [],
    nextAction,
    meetingDate,
    followupDate,
    tasks = [],
    leadScore = 0,
    leadTemperature = "cold",
    coaching = {},
  } = analysis;

  const scoreColor =
    leadScore >= 71 ? "text-danger-500" :
    leadScore >= 31 ? "text-warning-600" :
    "text-brand-600";

  return (
    <section className="card overflow-hidden">
      <header className="flex flex-wrap items-start justify-between gap-4 px-6 py-5 border-b border-ink-100">
        <div className="min-w-0">
          <p className="eyebrow">Sales Intelligence</p>
          <h2 className="h-display text-2xl mt-1">Call analysis</h2>
          <p className="text-[13px] text-ink-500 mt-1.5">
            AI extraction from the call transcript.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-ink-200 bg-ink-50">
            <div className="text-right">
              <p className="eyebrow">Lead Score</p>
              <p className={`num text-2xl leading-none mt-0.5 ${scoreColor}`}>{leadScore}</p>
            </div>
            <span className={`pill ${TEMP_PILL[leadTemperature]} uppercase`}>{leadTemperature}</span>
          </div>
          {onCreateLead && (
            <button
              onClick={() => onCreateLead(analysis)}
              className="btn btn-primary"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Save as Lead
            </button>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className="btn btn-secondary"
            aria-label={open ? "Collapse" : "Expand"}
          >
            <svg className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      </header>

      {open && (
        <div className="px-6 py-6 space-y-7">
          {/* Profile */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Datum label="Customer" value={customerName} />
            <Datum label="Company" value={company} />
            <Datum label="Budget" value={budget} mono />
            <Datum label="Timeline" value={timeline} />
          </div>

          {/* Signals */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Signal label="Sentiment" value={sentiment} pill={SENTIMENT_PILL[sentiment]} />
            <Signal label="Urgency" value={urgency} pill={URGENCY_PILL[urgency]} />
            <Datum label="Meeting date" value={meetingDate} mono small />
            <Datum label="Follow-up date" value={followupDate} mono small />
          </div>

          {nextAction && (
            <div className="card-tight px-5 py-4 bg-brand-50 border-brand-100">
              <p className="eyebrow text-brand-700">Recommended next action</p>
              <p className="text-[15px] text-ink-900 mt-1 leading-snug">{nextAction}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ListBlock label="Pain points" items={painPoints} tone="brand" />
            <ListBlock label="Requirements" items={requirements} tone="brand" />
            <ListBlock label="Objections" items={objections} tone="warn" />
          </div>

          {competitors.length > 0 && (
            <Block label="Competitors mentioned">
              <div className="flex flex-wrap gap-2">
                {competitors.map((c, i) => (
                  <span key={i} className="pill pill-neutral">{c}</span>
                ))}
              </div>
            </Block>
          )}

          {tasks.length > 0 && (
            <Block label={`Auto-generated tasks · ${tasks.length}`}>
              <ul className="divide-y divide-ink-100 border border-ink-200 rounded-2xl overflow-hidden">
                {tasks.map((t, i) => (
                  <li key={i} className="flex items-start gap-4 px-4 py-3 bg-white">
                    <span className="flex-shrink-0 grid place-items-center w-7 h-7 rounded-lg bg-ink-100 text-[11px] font-semibold text-ink-700">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="pill pill-brand uppercase text-[10px]">{t.type}</span>
                        {t.dueDate && (
                          <span className="text-[11.5px] text-ink-500">Due {t.dueDate}</span>
                        )}
                      </div>
                      <p className="text-[14px] text-ink-900">{t.description}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </Block>
          )}

          {(coaching.strengths?.length || coaching.weaknesses?.length || coaching.suggestions?.length) ? (
            <Block label="AI coaching">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <CoachCol title="Strengths" items={coaching.strengths} tone="success" />
                <CoachCol title="Weaknesses" items={coaching.weaknesses} tone="danger" />
                <CoachCol title="Suggestions" items={coaching.suggestions} tone="brand" />
              </div>
            </Block>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Datum({ label, value, mono, small }) {
  return (
    <div className="card-tight px-4 py-3">
      <p className="eyebrow">{label}</p>
      <p
        className={`text-ink-900 mt-1 ${
          mono ? "font-mono text-[13.5px]" : small ? "text-[13px]" : "text-[14.5px] font-medium"
        }`}
      >
        {value || <span className="text-ink-400">—</span>}
      </p>
    </div>
  );
}

function Signal({ label, value, pill }) {
  return (
    <div className="card-tight px-4 py-3">
      <p className="eyebrow">{label}</p>
      <div className="mt-2">
        <span className={`pill ${pill} capitalize`}>{value}</span>
      </div>
    </div>
  );
}

function Block({ label, children }) {
  return (
    <div>
      <p className="h-section mb-3">{label}</p>
      {children}
    </div>
  );
}

function ListBlock({ label, items, tone }) {
  if (!items?.length) return null;
  const dot = tone === "warn" ? "bg-warning-500" : "bg-brand-500";
  return (
    <div>
      <p className="h-section mb-3">{label}</p>
      <ul className="space-y-2.5">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3 text-[13.5px] text-ink-700 leading-snug">
            <span className={`mt-[7px] w-1.5 h-1.5 rounded-full ${dot} flex-shrink-0`} />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const COACH_TONE = {
  success: { dot: "bg-success-500", title: "text-success-600", border: "border-success-500/20", bg: "bg-success-50" },
  danger: { dot: "bg-danger-500", title: "text-danger-600", border: "border-danger-500/20", bg: "bg-danger-50" },
  brand: { dot: "bg-brand-500", title: "text-brand-600", border: "border-brand-500/20", bg: "bg-brand-50" },
};

function CoachCol({ title, items = [], tone }) {
  const cfg = COACH_TONE[tone] || COACH_TONE.brand;
  return (
    <div className={`rounded-2xl border ${cfg.border} ${cfg.bg} px-4 py-4`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        <p className={`text-[12px] font-semibold uppercase tracking-wider ${cfg.title}`}>{title}</p>
      </div>
      {items.length > 0 ? (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li key={i} className="text-[13px] text-ink-700 leading-snug">{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-ink-400 italic">None noted</p>
      )}
    </div>
  );
}
