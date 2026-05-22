import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import { fetchAllTasks, updateTask, deleteTask, createTask } from "../services/supabase";
import { friendlyError } from "../utils/errorMessage";
import { PageHeader, ErrorBanner } from "./AnalyticsPage";

const TYPE_PILL = {
  call: "pill-brand",
  meeting: "pill-brand",
  proposal: "pill-success",
  email: "pill-warn",
  other: "pill-neutral",
};

const TASK_TYPES = ["call", "meeting", "proposal", "email", "other"];

export default function TasksPage({ session, embedded = false }) {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("open");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [newDesc, setNewDesc] = useState("");
  const [newType, setNewType] = useState("other");
  const [newDue, setNewDue] = useState("");

  useEffect(() => {
    if (!session?.user?.id) return;
    load();
  }, [session?.user?.id]);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      setTasks(await fetchAllTasks(session.user.id));
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setLoading(false);
    }
  }

  async function toggleStatus(task) {
    const nextStatus = task.status === "completed" ? "open" : "completed";
    try {
      const updated = await updateTask(task.id, { status: nextStatus });
      setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, ...updated, leads: task.leads } : t)));
    } catch (err) {
      setError(friendlyError(err.message));
    }
  }

  async function handleDelete(taskId) {
    if (!confirm("Delete this task?")) return;
    try {
      await deleteTask(taskId);
      setTasks((current) => current.filter((t) => t.id !== taskId));
    } catch (err) {
      setError(friendlyError(err.message));
    }
  }

  async function handleAdd() {
    if (!newDesc.trim()) return;
    try {
      setCreating(true);
      const created = await createTask({
        userId: session.user.id,
        taskType: newType,
        description: newDesc.trim(),
        dueDate: newDue || null,
      });
      setTasks((current) => [{ ...created, leads: null }, ...current]);
      setNewDesc("");
      setNewDue("");
      setNewType("other");
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setCreating(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (typeFilter !== "all" && t.task_type !== typeFilter) return false;
      if (q) {
        const lead = t.leads || {};
        const blob = `${t.description || ""} ${lead.lead_name || ""} ${lead.company || ""}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, statusFilter, typeFilter, search]);

  const stats = useMemo(() => {
    const open = tasks.filter((t) => t.status === "open");
    const today = new Date().toISOString().slice(0, 10);
    return {
      total: tasks.length,
      open: open.length,
      overdue: open.filter((t) => t.due_date && t.due_date < today).length,
      completed: tasks.filter((t) => t.status === "completed").length,
    };
  }, [tasks]);

  const content = (
    <main className={embedded ? "min-w-0" : "app-container pb-12"}>
      <PageHeader
        eyebrow="Action items"
        title="Tasks"
        subtitle="Auto-extracted from sales calls and manually added. Tied to leads when available."
      />

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6 rise">
        <Stat label="Total" value={stats.total} />
        <Stat label="Open" value={stats.open} tone="brand" />
        <Stat label="Overdue" value={stats.overdue} tone="danger" />
        <Stat label="Completed" value={stats.completed} tone="success" />
      </div>

      <div className="card p-5 mb-4 rise rise-1">
        <p className="h-section mb-3">Add task</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="What needs doing?"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            className="flex-1 min-w-[220px]"
          />
          <select
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="!w-auto"
          >
            {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <input
            type="date"
            value={newDue}
            onChange={(e) => setNewDue(e.target.value)}
            className="!w-auto"
          />
          <button
            onClick={handleAdd}
            disabled={creating || !newDesc.trim()}
            className="btn btn-primary"
          >
            {creating ? "Adding…" : "Add task"}
          </button>
        </div>
      </div>

      <div className="card p-4 mb-4 flex flex-wrap items-center gap-3 rise rise-2">
        <div className="relative flex-1 min-w-[220px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search tasks, leads, companies…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="!w-auto"
        >
          <option value="all">All status</option>
          <option value="open">Open</option>
          <option value="completed">Completed</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="!w-auto"
        >
          <option value="all">All types</option>
          {TASK_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-ink-400">Loading tasks…</p>
      ) : filtered.length === 0 ? (
        <EmptyState hasTasks={tasks.length > 0} />
      ) : (
        <ul className="space-y-2.5 rise rise-3">
          {filtered.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={toggleStatus}
              onDelete={handleDelete}
              onOpenLead={(leadId) => navigate(`/sales-assistant/leads?open=${leadId}`)}
            />
          ))}
        </ul>
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

function TaskRow({ task, onToggle, onDelete, onOpenLead }) {
  const isDone = task.status === "completed";
  const today = new Date().toISOString().slice(0, 10);
  const overdue = !isDone && task.due_date && task.due_date < today;
  const lead = task.leads;

  return (
    <li className={`card flex items-start gap-4 px-5 py-4 card-hover ${overdue ? "border-danger-500/30" : ""}`}>
      <button
        onClick={() => onToggle(task)}
        className={`mt-0.5 grid place-items-center w-5 h-5 rounded-md border-2 flex-shrink-0 transition-colors ${isDone ? "bg-success-500 border-success-500" : "border-ink-300 hover:border-brand-500"}`}
        aria-label={isDone ? "Mark open" : "Mark complete"}
      >
        {isDone && (
          <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`pill ${TYPE_PILL[task.task_type] || TYPE_PILL.other} uppercase text-[10px]`}>
            {task.task_type}
          </span>
          {task.source === "ai" && (
            <span className="pill pill-brand uppercase text-[10px]">AI</span>
          )}
          {overdue && (
            <span className="pill pill-danger uppercase text-[10px]">Overdue</span>
          )}
        </div>
        <p className={`text-[14.5px] mt-1.5 ${isDone ? "text-ink-400 line-through" : "text-ink-900"}`}>
          {task.description}
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[12px] text-ink-500">
          {task.due_date && <span>Due {task.due_date}</span>}
          {lead && (
            <button onClick={() => onOpenLead(lead.id)} className="text-brand-600 hover:text-brand-700 transition-colors font-medium">
              → {lead.lead_name || "Unknown"}{lead.company ? ` · ${lead.company}` : ""}
            </button>
          )}
        </div>
      </div>

      <button
        onClick={() => onDelete(task.id)}
        className="btn btn-danger-ghost !py-1.5 !px-2.5 text-[12px]"
      >
        Delete
      </button>
    </li>
  );
}

function Stat({ label, value, tone }) {
  const TONE = {
    danger: "text-danger-600",
    brand: "text-brand-600",
    success: "text-success-600",
  };
  return (
    <div className="card p-5">
      <p className="eyebrow">{label}</p>
      <p className={`num text-[32px] leading-none mt-2 ${TONE[tone] || "text-ink-900"}`}>{value}</p>
    </div>
  );
}

function EmptyState({ hasTasks }) {
  return (
    <div className="card px-8 py-16 text-center">
      <div className="grid place-items-center w-12 h-12 mx-auto rounded-2xl bg-brand-50 text-brand-600 mb-4">
        <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 11L12 14L22 4M21 12V19C21 20.1046 20.1046 21 19 21H5C3.89543 21 3 20.1046 3 19V5C3 3.89543 3.89543 3 5 3H16" />
        </svg>
      </div>
      <p className="h-display text-xl">
        {hasTasks ? "No matches" : "No tasks yet"}
      </p>
      <p className="text-[13.5px] text-ink-500 mt-2 max-w-md mx-auto">
        {hasTasks
          ? "Try clearing the filters or change status."
          : "Save a call as a lead — AI auto-generates tasks from the conversation."}
      </p>
    </div>
  );
}
