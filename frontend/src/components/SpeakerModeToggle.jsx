export default function SpeakerModeToggle({ enabled, onChange, disabled = false }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-50"
      aria-pressed={enabled}
    >
      <span>Speaker Mode</span>
      <span
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          enabled ? "bg-indigo-600" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            enabled ? "translate-x-4" : "translate-x-1"
          }`}
        />
      </span>
      <span className={enabled ? "text-indigo-700" : "text-gray-400"}>
        {enabled ? "ON" : "OFF"}
      </span>
    </button>
  );
}
