import { useCallback, useEffect, useMemo, useState } from "react";
import {
  adjustCredits,
  deleteUser,
  listUsers,
  suspendUser,
  unsuspendUser,
} from "../../services/admin";
import ConfirmModal from "../ConfirmModal";
import AdminUserDetail from "./AdminUserDetail";
import { friendlyError } from "../../utils/errorMessage";

const PAGE_SIZE = 20;

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [detailUserId, setDetailUserId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listUsers({ search, plan: planFilter, status: statusFilter });
      setUsers(result.users || []);
      setError("");
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setLoading(false);
    }
  }, [search, planFilter, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const visible = useMemo(
    () => users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [users, page]
  );

  async function handleAddCredits(user) {
    const raw = window.prompt(`Add credits to ${user.email || user.user_id}. Amount:`);
    if (!raw) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setActionBusy(true);
    try {
      await adjustCredits(user.user_id, "add", Math.floor(amount));
      await load();
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleResetCredits(user) {
    if (!window.confirm(`Reset used credits for ${user.email || user.user_id}?`)) return;
    setActionBusy(true);
    try {
      await adjustCredits(user.user_id, "reset", 0);
      await load();
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleToggleSuspend(user) {
    setActionBusy(true);
    try {
      if (user.suspended) await unsuspendUser(user.user_id);
      else await suspendUser(user.user_id);
      await load();
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    setActionBusy(true);
    try {
      await deleteUser(pendingDelete.user_id);
      setPendingDelete(null);
      await load();
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Users</h1>
          <p className="mt-1 text-sm text-gray-500">{users.length} total · page {page}/{totalPages}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search email or id"
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          />
          <select
            value={planFilter}
            onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">All plans</option>
            <option value="free">Free</option>
            <option value="pro">Pro</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            <option value="">All status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Credits</th>
              <th className="px-4 py-3">Transcripts</th>
              <th className="px-4 py-3">Minutes</th>
              <th className="px-4 py-3">Failed</th>
              <th className="px-4 py-3">Last active</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-sm text-gray-500">Loading users…</td></tr>
            )}
            {!loading && visible.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-6 text-center text-sm text-gray-500">No users match the filters.</td></tr>
            )}
            {!loading && visible.map((user) => (
              <tr key={user.user_id} className="hover:bg-gray-50">
                <td className="px-4 py-3 align-top">
                  <p className="font-medium text-gray-800 truncate max-w-[220px]">{user.email || "—"}</p>
                  <p className="text-xs text-gray-400 truncate max-w-[220px]">{user.user_id}</p>
                </td>
                <td className="px-4 py-3 align-top text-gray-600">{user.plan || "free"}</td>
                <td className="px-4 py-3 align-top">
                  <span className="font-semibold text-gray-800">{user.remaining_credits}</span>
                  <span className="text-gray-400"> / {user.total_credits}</span>
                  <p className="text-xs text-gray-400">used {user.used_credits}</p>
                </td>
                <td className="px-4 py-3 align-top text-gray-600">{user.transcripts_total}</td>
                <td className="px-4 py-3 align-top text-gray-600">{user.audio_minutes}</td>
                <td className="px-4 py-3 align-top text-gray-600">{user.transcripts_failed}</td>
                <td className="px-4 py-3 align-top text-xs text-gray-500">{formatDate(user.last_active_at)}</td>
                <td className="px-4 py-3 align-top">
                  <StatusPill status={user.status} />
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <ActionButton onClick={() => setDetailUserId(user.user_id)}>View</ActionButton>
                    <ActionButton onClick={() => handleAddCredits(user)} disabled={actionBusy}>+ credits</ActionButton>
                    <ActionButton onClick={() => handleResetCredits(user)} disabled={actionBusy}>reset</ActionButton>
                    <ActionButton
                      onClick={() => handleToggleSuspend(user)}
                      disabled={actionBusy}
                      tone="amber"
                    >
                      {user.suspended ? "unsuspend" : "suspend"}
                    </ActionButton>
                    <ActionButton
                      onClick={() => setPendingDelete(user)}
                      disabled={actionBusy}
                      tone="danger"
                    >
                      delete
                    </ActionButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-gray-500">Page {page} of {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      <AdminUserDetail userId={detailUserId} open={Boolean(detailUserId)} onClose={() => setDetailUserId(null)} />

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Delete user?"
        message={`This will delete the user and ALL their transcripts. ${pendingDelete?.email || pendingDelete?.user_id || ""}`}
        confirmLabel="Delete user"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

function ActionButton({ children, onClick, disabled, tone = "default" }) {
  const toneClass = tone === "danger"
    ? "border-red-200 text-red-700 hover:bg-red-50"
    : tone === "amber"
    ? "border-amber-200 text-amber-700 hover:bg-amber-50"
    : "border-gray-200 text-gray-700 hover:bg-gray-50";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md border bg-white px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
    >
      {children}
    </button>
  );
}

function StatusPill({ status }) {
  const map = {
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    suspended: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${map[status] || "bg-gray-50 text-gray-600 border-gray-200"}`}>
      {status || "active"}
    </span>
  );
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}
