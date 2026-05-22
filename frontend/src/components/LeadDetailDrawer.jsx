import { useEffect, useState } from "react";
import {
  fetchLead,
  updateLead,
  fetchLeadCallAnalyses,
  fetchLeadTasks,
  createTask,
  updateTask,
  deleteTask,
} from "../services/supabase";
import { friendlyError } from "../utils/errorMessage";

const TASK_TYPES = ["call", "meeting", "proposal", "email", "other"];

const TYPE_PILL = {
  call: "pill-brand",
  meeting: "pill-brand",
  proposal: "pill-success",
  email: "pill-warn",
  other: "pill-neutral",
};

export default function LeadDetailDrawer({ leadId, onClose, onUpdated }) {
  const [lead, setLead] = useState(null);
  const [calls, setCalls] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState({});
  const [newTaskDesc, setNewTaskDesc] = useState("");
  const [newTaskType, setNewTaskType] = useState("other");
  const [newTaskDue, setNewTaskDue] = useState("");

  useEffect(() => {
    if (!leadId) return;
    load();
  }, [leadId]);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const [l, c, t] = await Promise.all([
        fetchLead(leadId),
        fetchLeadCallAnalyses(leadId),
        fetchLeadTasks(leadId),
      ]);
      setLead(l);
      setDraft({
        lead_name: l.lead_name || "",
        email: l.email || "",
        phone: l.phone || "",
        company: l.company || "",
        followup_date: l.followup_date || "",
        notes: l.notes || "",
      });
      setCalls(c);
      setTasks(t);
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      const patch = { ...draft, followup_date: draft.followup_date || null };
      const updated = await updateLead(leadId, patch);
      setLead(updated);
      onUpdated?.(updated);
    } catch (err) {
      setError(friendlyError(err.message));
    }
  }

  async function handleAddTask() {
    if (!newTaskDesc.trim() || !lead) return;
    try {
      const created = await createTask({
        userId: lead.owner_id,
        leadId,
        taskType: newTaskType,
        description: newTaskDesc.trim(),
        dueDate: newTaskDue || null,
      });
      setTasks((current) => [created, ...current]);
      setNewTaskDesc("");
      setNewTaskDue("");
      setNewTaskType("other");
    } catch (err) {
      setError(friendlyError(err.message));
    }
  }

  async function toggleTask(task) {
    const nextStatus = task.status === "completed" ? "open" : "completed";
    try {
      const updated = await updateTask(task.id, { status: nextStatus });
      setTasks((current) => current.map((t) => (t.id === task.id ? updated : t)));
    } catch (err) {
      setError(friendlyError(err.message));
    }
  }

  async function removeTask(taskId) {
    if (!confirm("Delete this task?")) return;
    try {
      await deleteTask(taskId);
      setTasks((current) => current.filter((t) => t.id !== taskId));
    } catch (err) {
      setError(friendlyError(err.message));
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-ink-900/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative ml-auto w-full max-w-xl bg-white border-l border-ink-200 shadow-popover overflow-y-auto rise">
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-ink-200 px-6 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <p className="eyebrow">Lead detail</p>
            <p className="h-display text-[22px] mt-1 truncate">
              {lead?.lead_name || "Loading…"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="btn btn-ghost !p-2"
            aria-label="Close"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-6 space-y-7">
          {error && (
            <div className="card-tight bg-danger-50 border-danger-500/20 px-4 py-3 text-[13.5px] text-danger-600">
              {error}
            </div>
          )}

          {loading || !lead ? (
            <SkeletonDrawer />
          ) : (
            <>
              <Section title="Profile">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Name" value={draft.lead_name} onChange={(v) => setDraft({ ...draft, lead_name: v })} />
                  <Field label="Company" value={draft.company} onChange={(v) => setDraft({ ...draft, company: v })} />
                  <Field label="Email" value={draft.email} onChange={(v) => setDraft({ ...draft, email: v })} />
                  <Field label="Phone" value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} />
                  <Field label="Follow-up" type="date" value={draft.followup_date} onChange={(v) => setDraft({ ...draft, followup_date: v })} />
                </div>
                <div className="mt-3">
                  <Field label="Notes" textarea value={draft.notes} onChange={(v) => setDraft({ ...draft, notes: v })} />
                </div>
                <button onClick={handleSave} className="btn btn-primary mt-4">
                  Save changes
                </button>
              </Section>

              <Section title={`Tasks · ${tasks.length}`}>
                <div className="card-tight p-3 mb-3 space-y-2">
                  <input
                    type="text"
                    placeholder="Add a task…"
                    value={newTaskDesc}
                    onChange={(e) => setNewTaskDesc(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleAddTask(); }}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={newTaskType}
                      onChange={(e) => setNewTaskType(e.target.value)}
                      className="!w-auto !text-[12.5px]"
                    >
                      {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input
                      type="date"
                      value={newTaskDue}
                      onChange={(e) => setNewTaskDue(e.target.value)}
                      className="!w-auto !text-[12.5px]"
                    />
                    <button
                      onClick={handleAddTask}
                      disabled={!newTaskDesc.trim()}
                      className="btn btn-primary ml-auto !py-1.5"
                    >
                      Add
                    </button>
                  </div>
                </div>

                {tasks.length === 0 ? (
                  <p className="text-sm text-ink-400">No tasks yet.</p>
                ) : (
                  <ul className="divide-y divide-ink-100 card-tight overflow-hidden">
                    {tasks.map((t) => {
                      const isDone = t.status === "completed";
                      return (
                        <li key={t.id} className="flex items-start gap-3 px-3.5 py-3">
                          <button
                            onClick={() => toggleTask(t)}
                            className={`mt-0.5 grid place-items-center w-5 h-5 rounded-md border-2 flex-shrink-0 transition-colors ${isDone ? "bg-success-500 border-success-500" : "border-ink-300 hover:border-brand-500"}`}
                          >
                            {isDone && (
                              <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className={`pill ${TYPE_PILL[t.task_type] || TYPE_PILL.other} uppercase text-[10px]`}>
                                {t.task_type}
                              </span>
                              <button
                                onClick={() => removeTask(t.id)}
                                className="text-[11px] font-medium text-danger-600 hover:text-danger-500 transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                            <p className={`text-[13.5px] ${isDone ? "text-ink-400 line-through" : "text-ink-900"}`}>
                              {t.description}
                            </p>
                            {t.due_date && (
                              <p className="text-[11.5px] text-ink-500 mt-1">Due {t.due_date}</p>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Section>

              <Section title={`Call history · ${calls.length}`}>
                {calls.length === 0 ? (
                  <p className="text-sm text-ink-400">No calls linked.</p>
                ) : (
                  <ul className="space-y-3">
                    {calls.map((c) => (
                      <li key={c.id} className="card-tight p-3.5">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[12px] text-ink-500 font-mono">
                            {new Date(c.created_at).toLocaleString()}
                          </span>
                          <span className="num text-[15px] text-brand-600">{c.lead_score}</span>
                        </div>
                        <p className="text-[13.5px] text-ink-900 mt-1">
                          {c.analysis?.nextAction || c.analysis?.painPoints?.[0] || "Call recorded"}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          <span className="pill pill-neutral capitalize">{c.sentiment}</span>
                          <span className="pill pill-neutral capitalize">{c.urgency}</span>
                          <span className="pill pill-neutral capitalize">{c.lead_temperature}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div>
      <p className="h-section mb-3">{title}</p>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, type = "text", textarea }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5">
        {label}
      </label>
      {textarea ? (
        <textarea
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      ) : (
        <input
          type={type}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function SkeletonDrawer() {
  return (
    <div className="space-y-4">
      <div className="h-4 w-24 bg-ink-100 rounded animate-pulse" />
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-ink-100 rounded-lg animate-pulse" />
        ))}
      </div>
      <div className="h-24 bg-ink-100 rounded-lg animate-pulse" />
    </div>
  );
}
