import { useEffect, useState } from "react";
import { getSettings, updateSetting } from "../../services/admin";
import { friendlyError } from "../../utils/errorMessage";

const FIELD_DEFS = [
  { key: "default_credits", label: "Default credits", type: "number", help: "Starting credits for new users." },
  { key: "credits_per_minute", label: "Credits per minute", type: "number", help: "Cost rate per minute of audio." },
  { key: "max_upload_mb", label: "Max upload size (MB)", type: "number", help: "Reject uploads larger than this." },
  { key: "max_audio_minutes", label: "Max audio duration (min)", type: "number", help: "Reject audio longer than this." },
  { key: "daily_reset", label: "Daily credit reset", type: "boolean", help: "Reset used_credits at UTC midnight." },
  { key: "assemblyai_enabled", label: "AssemblyAI primary", type: "boolean", help: "Use AssemblyAI as the primary engine." },
  { key: "groq_fallback_enabled", label: "Groq Whisper fallback", type: "boolean", help: "Fall back to Groq Whisper on AssemblyAI failure." },
  { key: "fallback_order", label: "Fallback order", type: "list", help: "Engine order, top first." },
];

export default function AdminSettings() {
  const [values, setValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await getSettings();
        if (!cancelled) setValues(result || {});
      } catch (err) {
        if (!cancelled) setError(friendlyError(err.message));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function commit(key, value) {
    setBusy(true);
    setInfo("");
    setError("");
    try {
      await updateSetting(key, value);
      setValues((current) => ({ ...current, [key]: value }));
      setInfo(`Saved ${key}.`);
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading settings…</p>;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">Global runtime configuration. Changes take effect immediately for new requests.</p>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {info && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>}

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <ul className="divide-y divide-gray-100">
          {FIELD_DEFS.map((field) => (
            <li key={field.key} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-800">{field.label}</p>
                <p className="mt-0.5 text-xs text-gray-500">{field.help}</p>
              </div>
              <SettingControl
                field={field}
                value={values[field.key]}
                onCommit={(value) => commit(field.key, value)}
                busy={busy}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function SettingControl({ field, value, onCommit, busy }) {
  if (field.type === "boolean") {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onCommit(!value)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${value ? "bg-indigo-600" : "bg-gray-300"}`}>
          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${value ? "translate-x-4" : "translate-x-1"}`} />
        </span>
        <span className={value ? "text-indigo-700" : "text-gray-400"}>{value ? "ON" : "OFF"}</span>
      </button>
    );
  }

  if (field.type === "list") {
    return <ListEditor value={Array.isArray(value) ? value : []} onCommit={onCommit} busy={busy} />;
  }

  return <NumberEditor value={value} onCommit={onCommit} busy={busy} />;
}

function NumberEditor({ value, onCommit, busy }) {
  const [draft, setDraft] = useState(value ?? 0);
  useEffect(() => { setDraft(value ?? 0); }, [value]);
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value === "" ? "" : Number(e.target.value))}
        className="w-28 rounded-lg border border-gray-200 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
      />
      <button
        type="button"
        disabled={busy || draft === value}
        onClick={() => onCommit(Number(draft))}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Save
      </button>
    </div>
  );
}

function ListEditor({ value, onCommit, busy }) {
  const [draft, setDraft] = useState(value.join(", "));
  useEffect(() => { setDraft(value.join(", ")); }, [value.join(", ")]);
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="assemblyai, groq_whisper"
        className="w-64 rounded-lg border border-gray-200 px-3 py-1.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => onCommit(draft.split(",").map((s) => s.trim()).filter(Boolean))}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Save
      </button>
    </div>
  );
}
