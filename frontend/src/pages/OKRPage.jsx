import { useEffect, useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import {
  fetchObjectives,
  createObjective,
  updateObjective,
  deleteObjective,
  createKeyResult,
  updateKeyResult,
  deleteKeyResult,
  fetchKras,
  createKra,
  updateKra,
  deleteKra,
  fetchKpiSnapshot,
} from "../services/supabase";
import { friendlyError } from "../utils/errorMessage";
import { PageHeader, ErrorBanner, PanelHead } from "./AnalyticsPage";

const KRA_AREAS = ["Lead generation", "Communication", "Follow-up quality", "Deal closure"];

const KR_AUTO_MAP = [
  { keywords: ["lead", "generate"], metric: "totalLeads" },
  { keywords: ["call"], metric: "callsCompleted" },
  { keywords: ["meeting"], metric: "meetingsBooked" },
  { keywords: ["proposal"], metric: "proposalsSent" },
  { keywords: ["won", "close", "deal"], metric: "wonLeads" },
  { keywords: ["conversion"], metric: "conversionRate" },
  { keywords: ["hot"], metric: "hotLeads" },
];

export default function OKRPage({ session, embedded = false }) {
  const [objectives, setObjectives] = useState([]);
  const [kras, setKras] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newObjTitle, setNewObjTitle] = useState("");
  const [newKraArea, setNewKraArea] = useState(KRA_AREAS[0]);
  const [newKraDesc, setNewKraDesc] = useState("");

  useEffect(() => {
    if (!session?.user?.id) return;
    load();
  }, [session?.user?.id]);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const [objs, krasData, snap] = await Promise.all([
        fetchObjectives(session.user.id),
        fetchKras(session.user.id),
        fetchKpiSnapshot({ userId: session.user.id, periodStart: null, periodEnd: null }),
      ]);
      setObjectives(objs);
      setKras(krasData);
      setMetrics(snap.metrics);
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setLoading(false);
    }
  }

  async function handleAddObjective() {
    if (!newObjTitle.trim()) return;
    try {
      const obj = await createObjective({ userId: session.user.id, title: newObjTitle.trim() });
      setObjectives((c) => [obj, ...c]);
      setNewObjTitle("");
    } catch (err) {
      setError(friendlyError(err.message));
    }
  }

  async function handleDeleteObjective(id) {
    if (!confirm("Delete this objective and all its key results?")) return;
    try {
      await deleteObjective(id);
      setObjectives((c) => c.filter((o) => o.id !== id));
    } catch (err) {
      setError(friendlyError(err.message));
    }
  }

  async function handleAddKR(objectiveId, title, target, unit) {
    if (!title.trim() || !target) return;
    try {
      const kr = await createKeyResult({
        objectiveId,
        title: title.trim(),
        targetValue: Number(target),
        unit,
      });
      setObjectives((c) =>
        c.map((o) => (o.id === objectiveId ? { ...o, key_results: [...o.key_results, kr] } : o))
      );
    } catch (err) {
      setError(friendlyError(err.message));
    }
  }

  async function handleUpdateKR(krId, patch, objectiveId) {
    try {
      const updated = await updateKeyResult(krId, patch);
      setObjectives((c) =>
        c.map((o) =>
          o.id === objectiveId
            ? { ...o, key_results: o.key_results.map((k) => (k.id === krId ? updated : k)) }
            : o
        )
      );
    } catch (err) {
      setError(friendlyError(err.message));
    }
  }

  async function handleDeleteKR(krId, objectiveId) {
    try {
      await deleteKeyResult(krId);
      setObjectives((c) =>
        c.map((o) =>
          o.id === objectiveId ? { ...o, key_results: o.key_results.filter((k) => k.id !== krId) } : o
        )
      );
    } catch (err) {
      setError(friendlyError(err.message));
    }
  }

  async function handleSyncFromKpi(kr, objectiveId) {
    const live = liveValueForKR(kr.title, metrics);
    if (live == null) {
      setError("No matching KPI metric found for this Key Result title.");
      return;
    }
    await handleUpdateKR(kr.id, { current_value: live }, objectiveId);
  }

  async function syncAllFromKpi() {
    if (!metrics) return;
    for (const obj of objectives) {
      for (const kr of obj.key_results) {
        const live = liveValueForKR(kr.title, metrics);
        if (live != null && live !== kr.current_value) {
          await handleUpdateKR(kr.id, { current_value: live }, obj.id);
        }
      }
    }
  }

  async function handleAddKra() {
    if (!newKraDesc.trim()) return;
    try {
      const kra = await createKra({
        userId: session.user.id,
        area: newKraArea,
        description: newKraDesc.trim(),
      });
      setKras((c) => [kra, ...c]);
      setNewKraDesc("");
    } catch (err) {
      setError(friendlyError(err.message));
    }
  }

  async function handleDeleteKra(id) {
    try {
      await deleteKra(id);
      setKras((c) => c.filter((k) => k.id !== id));
    } catch (err) {
      setError(friendlyError(err.message));
    }
  }

  const stats = useMemo(() => {
    const allKrs = objectives.flatMap((o) => o.key_results);
    const completed = allKrs.filter((k) => (k.progress || 0) >= 100).length;
    const avgProgress = allKrs.length > 0
      ? Math.round(allKrs.reduce((sum, k) => sum + (k.progress || 0), 0) / allKrs.length)
      : 0;
    return { objectives: objectives.length, keyResults: allKrs.length, completed, avgProgress };
  }, [objectives]);

  const content = (
    <main className={embedded ? "min-w-0" : "app-container pb-12"}>
      <PageHeader
        eyebrow="Objectives"
        title="OKRs & KRAs"
        subtitle="Set objectives and key results. Sync progress from live KPIs in one click."
        actions={
          <button
            onClick={syncAllFromKpi}
            disabled={objectives.length === 0}
            className="btn btn-secondary"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M4 20l5-5M20 4l-5 5" />
            </svg>
            Sync from KPIs
          </button>
        }
      />

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 rise">
        <Stat label="Objectives" value={stats.objectives} />
        <Stat label="Key results" value={stats.keyResults} tone="brand" />
        <Stat label="Completed" value={stats.completed} tone="success" />
        <Stat label="Avg progress" value={`${stats.avgProgress}%`} tone="warn" />
      </div>

      <div className="card p-5 mb-6 rise rise-1">
        <p className="h-section mb-3">New objective</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="e.g. Increase sales performance"
            value={newObjTitle}
            onChange={(e) => setNewObjTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddObjective(); }}
            className="flex-1 min-w-[280px]"
          />
          <button
            onClick={handleAddObjective}
            disabled={!newObjTitle.trim()}
            className="btn btn-primary"
          >
            Add objective
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-ink-400">Loading…</p>
      ) : objectives.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-4 mb-8 rise rise-2">
          {objectives.map((obj) => (
            <ObjectiveCard
              key={obj.id}
              objective={obj}
              metrics={metrics}
              onDelete={() => handleDeleteObjective(obj.id)}
              onAddKR={(title, target, unit) => handleAddKR(obj.id, title, target, unit)}
              onUpdateKR={(krId, patch) => handleUpdateKR(krId, patch, obj.id)}
              onDeleteKR={(krId) => handleDeleteKR(krId, obj.id)}
              onSyncKR={(kr) => handleSyncFromKpi(kr, obj.id)}
            />
          ))}
        </div>
      )}

      <KraSection
        kras={kras}
        newArea={newKraArea}
        setNewArea={setNewKraArea}
        newDesc={newKraDesc}
        setNewDesc={setNewKraDesc}
        onAdd={handleAddKra}
        onDelete={handleDeleteKra}
      />
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

function ObjectiveCard({ objective, metrics, onDelete, onAddKR, onUpdateKR, onDeleteKR, onSyncKR }) {
  const [krTitle, setKrTitle] = useState("");
  const [krTarget, setKrTarget] = useState("");
  const [krUnit, setKrUnit] = useState("");

  const progress = useMemo(() => {
    const krs = objective.key_results || [];
    if (krs.length === 0) return 0;
    return Math.round(krs.reduce((sum, k) => sum + (k.progress || 0), 0) / krs.length);
  }, [objective.key_results]);

  return (
    <div className="card p-6">
      <div className="flex items-start justify-between gap-3 mb-4 pb-4 border-b border-ink-100">
        <div className="flex-1 min-w-0">
          <p className="eyebrow">Objective</p>
          <h2 className="h-display text-xl mt-1">{objective.title}</h2>
          {objective.description && (
            <p className="text-[13.5px] text-ink-500 mt-1.5">{objective.description}</p>
          )}
          <div className="mt-4">
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[12.5px] font-medium text-ink-700">Overall progress</span>
              <span className="num text-[14px] text-brand-600">{progress}%</span>
            </div>
            <div className="h-2.5 bg-ink-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${progress >= 100 ? "bg-success-500" : progress >= 50 ? "bg-brand-500" : "bg-warning-500"}`}
                style={{ width: `${Math.min(100, progress)}%` }}
              />
            </div>
          </div>
        </div>
        <button onClick={onDelete} className="btn btn-danger-ghost !py-1.5 !px-2.5 text-[12px]">
          Delete
        </button>
      </div>

      {objective.key_results?.length > 0 && (
        <ul className="space-y-3 mb-5">
          {objective.key_results.map((kr) => (
            <KeyResultRow
              key={kr.id}
              kr={kr}
              metrics={metrics}
              onUpdate={(patch) => onUpdateKR(kr.id, patch)}
              onDelete={() => onDeleteKR(kr.id)}
              onSync={() => onSyncKR(kr)}
            />
          ))}
        </ul>
      )}

      <div className="border-t border-ink-100 pt-4">
        <p className="eyebrow mb-2.5">Add key result</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="e.g. Generate 500 leads"
            value={krTitle}
            onChange={(e) => setKrTitle(e.target.value)}
            className="flex-1 min-w-[220px]"
          />
          <input
            type="number"
            placeholder="Target"
            value={krTarget}
            onChange={(e) => setKrTarget(e.target.value)}
            className="!w-24"
          />
          <input
            type="text"
            placeholder="Unit"
            value={krUnit}
            onChange={(e) => setKrUnit(e.target.value)}
            className="!w-24"
          />
          <button
            onClick={() => { onAddKR(krTitle, krTarget, krUnit); setKrTitle(""); setKrTarget(""); setKrUnit(""); }}
            disabled={!krTitle.trim() || !krTarget}
            className="btn btn-primary"
          >
            Add KR
          </button>
        </div>
      </div>
    </div>
  );
}

function KeyResultRow({ kr, metrics, onUpdate, onDelete, onSync }) {
  const [editing, setEditing] = useState(false);
  const [draftValue, setDraftValue] = useState(kr.current_value);
  const liveValue = liveValueForKR(kr.title, metrics);
  const progress = kr.progress != null ? Math.round(kr.progress) : 0;

  function commit() {
    const num = Number(draftValue);
    if (!Number.isNaN(num)) onUpdate({ current_value: num });
    setEditing(false);
  }

  return (
    <li className="card-tight p-4 bg-ink-50">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[13.5px] text-ink-900 font-medium flex-1">{kr.title}</p>
        <div className="flex items-center gap-2">
          {liveValue != null && liveValue !== kr.current_value && (
            <button
              onClick={onSync}
              className="text-[11.5px] font-semibold text-brand-600 hover:text-brand-700 transition-colors"
              title={`Live KPI value: ${liveValue}`}
            >
              ↻ Sync ({liveValue})
            </button>
          )}
          <button onClick={onDelete} className="text-[11.5px] font-medium text-danger-600 hover:text-danger-500 transition-colors">
            Delete
          </button>
        </div>
      </div>
      <div className="flex items-baseline justify-between mb-1.5">
        {editing ? (
          <div className="flex items-baseline gap-2">
            <input
              type="number"
              value={draftValue}
              onChange={(e) => setDraftValue(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
              autoFocus
              className="!w-24 !py-1 !text-sm"
            />
            <span className="text-[12px] text-ink-500">/ {kr.target_value} {kr.unit}</span>
          </div>
        ) : (
          <button onClick={() => setEditing(true)} className="text-[12.5px] text-ink-700 hover:text-brand-600 transition-colors">
            <span className="num text-[15px] text-ink-900">{kr.current_value}</span>
            <span className="text-ink-500"> / {kr.target_value} {kr.unit}</span>
          </button>
        )}
        <span className="num text-[13px] text-brand-600">{progress}%</span>
      </div>
      <div className="h-2 bg-white border border-ink-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${progress >= 100 ? "bg-success-500" : progress >= 50 ? "bg-brand-500" : "bg-warning-500"}`}
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>
    </li>
  );
}

function KraSection({ kras, newArea, setNewArea, newDesc, setNewDesc, onAdd, onDelete }) {
  return (
    <div className="card p-6">
      <PanelHead title="Key responsibility areas" subtitle="Assigned by managers. Used in performance reviews." />

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <select
          value={newArea}
          onChange={(e) => setNewArea(e.target.value)}
          className="!w-auto"
        >
          {KRA_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <input
          type="text"
          placeholder="Notes / target (e.g. 50 calls per week)"
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }}
          className="flex-1 min-w-[220px]"
        />
        <button
          onClick={onAdd}
          disabled={!newDesc.trim()}
          className="btn btn-primary"
        >
          Assign KRA
        </button>
      </div>

      {kras.length === 0 ? (
        <p className="text-sm text-ink-400">No KRAs assigned yet.</p>
      ) : (
        <ul className="divide-y divide-ink-100 card-tight overflow-hidden">
          {kras.map((kra) => (
            <li key={kra.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <span className="pill pill-brand uppercase text-[10px]">{kra.area}</span>
                {kra.description && <p className="text-[13.5px] text-ink-900 mt-2">{kra.description}</p>}
              </div>
              <button
                onClick={() => onDelete(kra.id)}
                className="text-[11.5px] font-medium text-danger-600 hover:text-danger-500 transition-colors"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  const TONE = {
    brand: "text-brand-600",
    success: "text-success-600",
    warn: "text-warning-600",
    danger: "text-danger-600",
  };
  return (
    <div className="card p-5">
      <p className="eyebrow">{label}</p>
      <p className={`num text-[32px] leading-none mt-2 ${TONE[tone] || "text-ink-900"}`}>{value}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="card px-8 py-16 text-center">
      <div className="grid place-items-center w-12 h-12 mx-auto rounded-2xl bg-brand-50 text-brand-600 mb-4">
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM12 18C8.68629 18 6 15.3137 6 12C6 8.68629 8.68629 6 12 6C15.3137 6 18 8.68629 18 12C18 15.3137 15.3137 18 12 18ZM12 14C13.1046 14 14 13.1046 14 12C14 10.8954 13.1046 10 12 10C10.8954 10 10 10.8954 10 12C10 13.1046 10.8954 14 12 14Z" />
        </svg>
      </div>
      <p className="h-display text-xl">No objectives yet</p>
      <p className="text-[13.5px] text-ink-500 mt-2 max-w-md mx-auto">
        Start with one like "Increase sales performance" and add key results below it.
      </p>
    </div>
  );
}

function liveValueForKR(title, metrics) {
  if (!metrics || !title) return null;
  const lower = title.toLowerCase();
  for (const entry of KR_AUTO_MAP) {
    const hit = entry.keywords.some((k) => lower.includes(k));
    if (hit) return metrics[entry.metric] ?? null;
  }
  return null;
}
