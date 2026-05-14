import { memo } from "react";

const SPEAKER_STYLES = [
  "bg-indigo-100 text-indigo-700 border-indigo-200",
  "bg-emerald-100 text-emerald-700 border-emerald-200",
  "bg-amber-100 text-amber-700 border-amber-200",
  "bg-rose-100 text-rose-700 border-rose-200",
];

function TranscriptSegment({
  segment,
  active,
  onClick,
  speakerMode = false,
  showSpeakerLabel = false,
  compactSpeakerLabel = false,
}) {
  const speaker = segment.speaker || "Speaker 1";
  const speakerStyle = SPEAKER_STYLES[(getSpeakerNumber(speaker) - 1) % SPEAKER_STYLES.length];

  return (
    <button
      type="button"
      onClick={() => onClick(segment.start)}
      className={`group w-full rounded-xl border px-4 py-3 text-left transition-all duration-200 ${
        active
          ? "border-indigo-300 bg-indigo-50 shadow-sm ring-2 ring-indigo-100"
          : "border-transparent bg-white hover:border-gray-200 hover:bg-gray-50"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 w-12 flex-shrink-0 rounded-full px-2 py-1 text-center text-xs font-semibold transition-colors ${
            active
              ? "bg-indigo-600 text-white"
              : "bg-gray-100 text-gray-500 group-hover:bg-gray-200"
          }`}
        >
          {formatTime(segment.start)}
        </span>
        <span className="min-w-0 flex-1">
          {speakerMode && (
            <span className="mb-1.5 flex items-center gap-2">
              {(showSpeakerLabel || compactSpeakerLabel) && (
                <span
                  className={`inline-flex border px-2 py-0.5 text-xs font-semibold transition-all ${
                    compactSpeakerLabel
                      ? "rounded-md bg-gray-50 text-gray-400 border-gray-200"
                      : `rounded-full ${speakerStyle}`
                  }`}
                >
                  {compactSpeakerLabel ? speaker.replace("Speaker ", "S") : speaker}
                </span>
              )}
              {active && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Speaking
                </span>
              )}
            </span>
          )}
          <span
            className={`block text-sm leading-relaxed transition-colors ${
              active ? "font-medium text-gray-950" : "text-gray-700"
            }`}
          >
            {segment.text}
          </span>
        </span>
      </div>
    </button>
  );
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function getSpeakerNumber(speaker) {
  const match = String(speaker).match(/(\d+)/);
  return match ? Number(match[1]) : 1;
}

export default memo(TranscriptSegment);
