const OUTPUT_LANGUAGES = [
  "English", "Hindi", "Gujarati", "Tamil", "Marathi",
  "Bengali", "Telugu", "Kannada", "Same as Original",
];

const FOCUS_OPTIONS = [
  "General Summary",
  "Issues & Solutions",
  "Q&A Format",
  "Action Items",
  "Key Decisions",
  "Custom",
];

const FORMAT_OPTIONS = ["Bullet Points", "Table", "Paragraph"];
const LENGTH_OPTIONS = ["Short", "Medium", "Detailed"];

export default function CustomizationPanel({ options, setOptions, disabled }) {
  function update(key, value) {
    setOptions({ ...options, [key]: value });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6 shadow-sm">
      <h2 className="text-base font-semibold text-gray-800 mb-1">Customization</h2>
      <p className="text-xs text-gray-500 mb-5">
        Tune how the summary is generated. Defaults work for most cases.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Dropdown
          label="Output Language"
          value={options.outputLanguage}
          options={OUTPUT_LANGUAGES}
          onChange={(v) => update("outputLanguage", v)}
          disabled={disabled}
        />
        <Dropdown
          label="Summary Focus"
          value={options.focus}
          options={FOCUS_OPTIONS}
          onChange={(v) => update("focus", v)}
          disabled={disabled}
        />
        <Dropdown
          label="Output Format"
          value={options.format}
          options={FORMAT_OPTIONS}
          onChange={(v) => update("format", v)}
          disabled={disabled}
        />
        <Dropdown
          label="Summary Length"
          value={options.length}
          options={LENGTH_OPTIONS}
          onChange={(v) => update("length", v)}
          disabled={disabled}
        />
      </div>

      {options.focus === "Custom" && (
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Custom focus
          </label>
          <input
            type="text"
            value={options.customFocus}
            onChange={(e) => update("customFocus", e.target.value)}
            disabled={disabled}
            placeholder="e.g. 'Highlight all mentions of pricing and competitors'"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm
              focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-100"
          />
        </div>
      )}
    </div>
  );
}

function Dropdown({ label, value, options, onChange, disabled }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white
          focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-gray-100"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  );
}
