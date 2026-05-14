import { useEffect, useMemo, useRef } from "react";
import TranscriptSegment from "./TranscriptSegment";

export default function TranscriptViewer({
  segments,
  currentTime,
  isPlaying,
  onSegmentClick,
  speakerMode = false,
}) {
  const segmentRefs = useRef({});
  const activeIndex = useMemo(
    () => findActiveSegmentIndex(segments, currentTime),
    [segments, currentTime]
  );

  useEffect(() => {
    if (activeIndex < 0) return;
    const node = segmentRefs.current[activeIndex];
    if (!node) return;

    node.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    });
  }, [activeIndex]);

  if (!segments?.length) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center">
        <p className="text-sm text-gray-500">Timestamped transcript is not available for this audio.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isPlaying && activeIndex >= 0 ? "bg-emerald-500 animate-pulse" : "bg-gray-300"
            }`}
          />
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {isPlaying && activeIndex >= 0 ? "Speaking now" : "Synced transcript"}
          </p>
        </div>
        <p className="text-xs text-gray-400">{segments.length} segments</p>
      </div>

      <div className="max-h-80 space-y-2 overflow-y-auto pr-1 scroll-smooth">
        {segments.map((segment, index) => (
          <div
            key={`${segment.start}-${index}`}
            ref={(node) => {
              if (node) segmentRefs.current[index] = node;
            }}
          >
            <TranscriptSegment
              segment={segment}
              active={index === activeIndex}
              onClick={onSegmentClick}
              speakerMode={speakerMode}
              showSpeakerLabel={speakerMode && segment.speaker !== segments[index - 1]?.speaker}
              compactSpeakerLabel={speakerMode && segment.speaker === segments[index - 1]?.speaker}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function findActiveSegmentIndex(segments, currentTime) {
  if (!segments?.length || currentTime == null) return -1;

  let left = 0;
  let right = segments.length - 1;
  let closestPast = -1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const segment = segments[mid];

    if (currentTime >= segment.start && currentTime < segment.end) {
      return mid;
    }

    if (currentTime >= segment.end) {
      closestPast = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return closestPast;
}
