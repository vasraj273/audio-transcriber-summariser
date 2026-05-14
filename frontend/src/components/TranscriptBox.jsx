import { useEffect, useMemo, useRef, useState } from "react";
import { copyText } from "../utils/copyText";
import AudioPlayer from "./AudioPlayer";
import Markdown from "./Markdown";
import SpeakerModeToggle from "./SpeakerModeToggle";
import TranscriptSegment from "./TranscriptSegment";
import TranscriptViewer from "./TranscriptViewer";

export default function TranscriptBox({
  transcript,
  speakerCount = 1,
  transcriptSegments = [],
  audioUrl = "",
}) {
  const audioRef = useRef(null);
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState("plain");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [speakerMode, setSpeakerMode] = useState(false);
  const syncedSegments = useMemo(
    () => normalizeSegments(transcriptSegments),
    [transcriptSegments]
  );
  const uniqueSpeakers = useMemo(
    () => new Set(syncedSegments.map((segment) => segment.speaker).filter(Boolean)),
    [syncedSegments]
  );
  const hasSyncedTranscript = Boolean(audioUrl && syncedSegments.length);
  const hasSpeakerMetadata = Boolean(speakerCount >= 2 && uniqueSpeakers.size >= 2);
  const displayText =
    speakerMode && hasSpeakerMetadata
      ? buildSpeakerCopyText(syncedSegments)
      : transcript;

  useEffect(() => {
    if (hasSyncedTranscript) {
      setView("synced");
    } else {
      setView("plain");
    }
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(false);
    setSpeakerMode(hasSpeakerMetadata);
  }, [hasSyncedTranscript, hasSpeakerMetadata, transcript]);

  async function handleCopy() {
    await copyText(displayText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSegmentClick(start) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = start;
    setCurrentTime(start);
    await audio.play().catch(() => {});
  }

  function handleLoadedMetadata() {
    const audio = audioRef.current;
    if (!audio) return;
    setDuration(audio.duration || 0);
  }

  function handleTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(audio.currentTime || 0);
  }

  function handleSeek(time) {
    setCurrentTime(time);
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Transcript</h2>
        <div className="flex flex-wrap items-center gap-3">
          {hasSyncedTranscript && (
            <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
              <ViewButton active={view === "synced"} onClick={() => setView("synced")}>
                Synced
              </ViewButton>
              <ViewButton active={view === "plain"} onClick={() => setView("plain")}>
                Plain
              </ViewButton>
            </div>
          )}

          <SpeakerModeToggle
            enabled={speakerMode}
            onChange={setSpeakerMode}
            disabled={!hasSpeakerMetadata}
          />

          <button
            onClick={handleCopy}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 transition-colors"
          >
            {copied ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {view === "synced" && hasSyncedTranscript ? (
        <TranscriptViewer
          segments={syncedSegments}
          currentTime={currentTime}
          isPlaying={isPlaying}
          onSegmentClick={handleSegmentClick}
          speakerMode={speakerMode && hasSpeakerMetadata}
        />
      ) : speakerMode && hasSpeakerMetadata ? (
        <PlainSegmentTranscript
          segments={syncedSegments}
          onSegmentClick={handleSegmentClick}
        />
      ) : (
        <div className="max-h-64 overflow-y-auto">
          <Markdown>{transcript}</Markdown>
        </div>
      )}

      {audioUrl && (
        <AudioPlayer
          audioRef={audioRef}
          src={audioUrl}
          currentTime={currentTime}
          duration={duration}
          isPlaying={isPlaying}
          playbackRate={playbackRate}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onPlayStateChange={setIsPlaying}
          onPlaybackRateChange={setPlaybackRate}
          onSeek={handleSeek}
        />
      )}
    </div>
  );
}

function ViewButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-all ${
        active
          ? "bg-white text-indigo-700 shadow-sm ring-1 ring-gray-200"
          : "text-gray-500 hover:text-gray-800"
      }`}
    >
      {children}
    </button>
  );
}

function PlainSegmentTranscript({ segments, onSegmentClick }) {
  return (
    <div className="max-h-80 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50/70 p-3">
      <div className="space-y-2 pr-1">
        {segments.map((segment, index) => (
          <div key={`${segment.start}-${index}`}>
            <TranscriptSegment
              segment={segment}
              active={false}
              onClick={onSegmentClick}
              speakerMode
              showSpeakerLabel={segment.speaker !== segments[index - 1]?.speaker}
              compactSpeakerLabel={segment.speaker === segments[index - 1]?.speaker}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizeSegments(segments) {
  return (segments || [])
    .map((segment) => ({
      start: Number(segment.start) || 0,
      end: Number(segment.end) || Number(segment.start) || 0,
      text: String(segment.text || "").trim(),
      speaker: String(segment.speaker || "").trim(),
    }))
    .filter((segment) => segment.text)
    .sort((a, b) => a.start - b.start);
}

function buildSpeakerCopyText(segments) {
  return segments
    .map((segment) => {
      const speaker = segment.speaker || "Speaker 1";
      return `${speaker} [${formatTime(segment.start)}] ${segment.text}`;
    })
    .join("\n");
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
