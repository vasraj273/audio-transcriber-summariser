import { useEffect } from "react";

const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export default function AudioPlayer({
  audioRef,
  src,
  currentTime,
  duration,
  isPlaying,
  playbackRate,
  onLoadedMetadata,
  onTimeUpdate,
  onPlayStateChange,
  onPlaybackRateChange,
  onSeek,
}) {
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
  }, [audioRef, playbackRate]);

  useEffect(() => {
    function handleKeyDown(event) {
      const tagName = event.target?.tagName?.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || tagName === "select") return;
      if (!audioRef.current || !src) return;

      if (event.code === "Space") {
        event.preventDefault();
        togglePlay();
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        seekTo(Math.max(0, audioRef.current.currentTime - 5));
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        seekTo(Math.min(duration || 0, audioRef.current.currentTime + 5));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [audioRef, src, duration, isPlaying]);

  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !src) return;

    if (audio.paused) {
      await audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }

  function seekTo(value) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    onSeek(value);
  }

  const progress = duration ? (currentTime / duration) * 100 : 0;

  return (
    <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <audio
        ref={audioRef}
        src={src}
        onLoadedMetadata={onLoadedMetadata}
        onTimeUpdate={onTimeUpdate}
        onPlay={() => onPlayStateChange(true)}
        onPause={() => onPlayStateChange(false)}
        onEnded={() => onPlayStateChange(false)}
      />

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={togglePlay}
              disabled={!src}
              className="flex h-11 w-11 items-center justify-center rounded-full bg-indigo-600 text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={isPlaying ? "Pause audio" : "Play audio"}
            >
              {isPlaying ? (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6 4h2.5v12H6V4zm5.5 0H14v12h-2.5V4z" />
                </svg>
              ) : (
                <svg className="ml-0.5 h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.5 4.75v10.5L15 10 6.5 4.75z" />
                </svg>
              )}
            </button>

            <div>
              <p className="text-sm font-semibold text-gray-800">Audio playback</p>
              <p className="text-xs text-gray-500">
                {formatTime(currentTime)} / {formatTime(duration)}
              </p>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <span className="font-medium">Speed</span>
            <select
              value={playbackRate}
              onChange={(event) => onPlaybackRateChange(Number(event.target.value))}
              className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm font-medium text-gray-700 outline-none transition-colors hover:border-gray-300 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
            >
              {SPEEDS.map((speed) => (
                <option key={speed} value={speed}>
                  {speed}x
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <input
            type="range"
            min="0"
            max={duration || 0}
            step="0.05"
            value={Math.min(currentTime, duration || 0)}
            onChange={(event) => seekTo(Number(event.target.value))}
            disabled={!src || !duration}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gray-200 accent-indigo-600 disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              background: `linear-gradient(to right, #4f46e5 ${progress}%, #e5e7eb ${progress}%)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.max(0, Math.floor(seconds || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}
