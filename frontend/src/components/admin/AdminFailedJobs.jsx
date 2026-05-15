import { useEffect, useState } from "react";
import { deleteFailedJob, listFailedJobs, retryFailedJob } from "../../services/admin";
import ConfirmModal from "../ConfirmModal";
import { friendlyError } from "../../utils/errorMessage";

const CATEGORY_LABEL = {
  rate_limit: "Rate limit",
  transcription_failure: "Transcription failure",
  audio_unsupported: "Audio unsupported",
  credit_issue: "Credit issue",
  network: "Network",
  other: "Other",
};

export default function AdminFailedJobs() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [detailOpen, setDetailOpen] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const result = await listFailedJobs();
      setJobs(result.jobs || []);
      setError("");
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleRetry(job) {
    setInfo("");
    try {
      await retryFailedJob(job.id);
    } catch (err) {
      setInfo(err.message || "Retry unavailable: original audio is not persisted.");
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    try {
      await deleteFailedJob(pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch (err) {
      setError(friendlyError(err.message));
    }
  }

  const filtered = categoryFilter
    ? jobs.filter((j) => (j.error_category || "other") === categoryFilter)
    : jobs;

  const categories = Array.from(new Set(jobs.map((j) => j.error_category || "other")));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Failed jobs</h1>
          <p className="mt-1 text-sm text-gray-500">{filtered.length} failures · grouped by error category.</p>
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
        >
          <option value="">All categories</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>{CATEGORY_LABEL[cat] || cat}</option>
          ))}
        </select>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {info && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{info}</div>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">File</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">Loading failed jobs…</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">No failed jobs. Nice.</td></tr>
            )}
            {!loading && filtered.map((job) => (
              <tr key={job.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 align-top">
                  <p className="text-sm text-gray-800 truncate max-w-[180px]">{job.email || job.user_id}</p>
                </td>
                <td className="px-4 py-3 align-top">
                  <p className="text-sm text-gray-700 truncate max-w-[220px]">{job.audio_name || "—"}</p>
                </td>
                <td className="px-4 py-3 align-top text-xs text-gray-500">{formatDate(job.created_at)}</td>
                <td className="px-4 py-3 align-top">
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                    {CATEGORY_LABEL[job.error_category] || job.error_category || "other"}
                  </span>
                </td>
                <td className="px-4 py-3 align-top">
                  <p className="text-xs text-red-600 truncate max-w-[260px]">{job.error_message || "—"}</p>
                </td>
                <td className="px-4 py-3 align-top">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <button
                      onClick={() => setDetailOpen(job)}
                      className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleRetry(job)}
                      className="rounded-md border border-indigo-200 bg-white px-2.5 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
                    >
                      Retry
                    </button>
                    <button
                      onClick={() => setPendingDelete(job)}
                      className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={Boolean(pendingDelete)}
        title="Delete failed job?"
        message="This removes the record permanently."
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {detailOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
          onClick={() => setDetailOpen(null)}
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-gray-800">Failed job detail</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <Row label="User">{detailOpen.email || detailOpen.user_id}</Row>
              <Row label="File">{detailOpen.audio_name || "—"}</Row>
              <Row label="Date">{formatDate(detailOpen.created_at)}</Row>
              <Row label="Category">{CATEGORY_LABEL[detailOpen.error_category] || detailOpen.error_category}</Row>
              <Row label="Reason"><span className="text-red-600">{detailOpen.error_message || "—"}</span></Row>
            </dl>
            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setDetailOpen(null)}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="col-span-2 text-gray-800 break-words">{children}</dd>
    </div>
  );
}

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return "—";
  }
}
