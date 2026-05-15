const USE_CASES = ["Meetings", "Interviews", "Phone calls", "WhatsApp recordings", "Lectures", "Podcasts"];

const TIPS = [
  "Clear audio improves accuracy.",
  "Multiple speakers are supported.",
  "Background noise may reduce quality.",
  "Longer recordings use more credits.",
];

export default function UploadTips() {
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Great for</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {USE_CASES.map((label) => (
            <li key={label} className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">
              ✓ {label}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-gray-500">Formats: MP3 • WAV • M4A · Up to 25 MB</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Tips for best results</p>
        <ul className="mt-2 space-y-1 text-xs text-gray-600">
          {TIPS.map((tip) => (
            <li key={tip}>• {tip}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
