import { useEffect, useState } from "react";
import { getUserDetail } from "../../services/admin";
import { friendlyError } from "../../utils/errorMessage";

export default function AdminUserDetail({ userId, open, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    setDetail(null);
    getUserDetail(userId)
      .then((data) => { if (!cancelled) setDetail(data); })
      .catch((err) => { if (!cancelled) setError(friendlyError(err.message)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-end justify-end bg-black/40 px-4 py-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl"
        style={{ maxHeight: "calc(100vh - 32px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-gray-800">User detail</h2>
            <p className="text-xs text-gray-500">{userId}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && <p className="text-sm text-gray-500">Loading…</p>}
          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {detail && (
            <div className="space-y-6">
              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Profile</h3>
                <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  <Field label="Email" value={detail.email || "—"} />
                  <Field label="Plan" value={detail.plan || "free"} />
                  <Field label="Status" value={detail.status} />
                  <Field label="Created" value={formatDate(detail.created_at)} />
                  <Field label="First login" value={formatDate(detail.first_login_at)} />
                  <Field label="Last active" value={formatDate(detail.last_active_at)} />
                </dl>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Usage</h3>
                <dl className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  <Field label="Credits" value={`${detail.remaining_credits}/${detail.total_credits} (used ${detail.used_credits})`} />
                  <Field label="Transcripts" value={`${detail.transcripts_total} (${detail.transcripts_completed} completed · ${detail.transcripts_failed} failed)`} />
                  <Field label="Audio minutes" value={`${detail.audio_minutes} min`} />
                  <Field label="Avg transcript length" value={`${detail.average_transcript_length} chars`} />
                </dl>
              </section>

              <section>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Recent activity</h3>
                {!detail.recent_activity?.length ? (
                  <p className="mt-2 text-sm text-gray-500">No recent activity.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200">
                    {detail.recent_activity.map((row) => (
                      <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-gray-800">{row.audio_name || "Untitled"}</p>
                          <p className="text-xs text-gray-400">{formatDate(row.created_at)} · {row.status}</p>
                          {row.error_message && (
                            <p className="mt-1 truncate text-xs text-red-600">{row.error_message}</p>
                          )}
                        </div>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                          {Math.round((row.duration_seconds || 0) / 60)} min
                        </span>
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700 border border-indigo-100">
                          {row.credits_used || 0} credits
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-gray-800 break-words">{value}</dd>
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
