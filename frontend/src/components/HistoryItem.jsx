import { useState } from "react";
import { downloadPDF } from "../utils/downloadPDF";
import Markdown from "./Markdown";

export default function HistoryItem({ record }) {
  const [expanded, setExpanded] = useState(false);

  const date = new Date(record.created_at).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
  const transcriptForExport =
    record.speaker_count >= 2 && record.speaker_transcript
      ? record.speaker_transcript
      : record.transcript;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-indigo-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
            <p className="font-semibold text-gray-800 truncate">{record.audio_name}</p>
          </div>
          <p className="text-xs text-gray-400">{date}</p>
          {!expanded && (
            <p className="text-sm text-gray-500 mt-2 line-clamp-2">{record.summary}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => downloadPDF({
              audioName: record.audio_name,
              createdAt: record.created_at,
              transcript: transcriptForExport,
              summary: record.summary,
              keyPoints: record.key_points,
            })}
            className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800 font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            PDF
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-sm text-gray-500 hover:text-gray-800 font-medium transition-colors"
          >
            {expanded ? "Collapse" : "View Details"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-5 flex flex-col gap-4 border-t border-gray-100 pt-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Summary</h3>
            <Markdown>{record.summary}</Markdown>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Key Points</h3>
            <ul className="space-y-1">
              {(record.key_points || []).map((point, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="flex-shrink-0 w-5 h-5 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold flex items-center justify-center mt-0.5">
                    {i + 1}
                  </span>
                  <div className="flex-1"><Markdown>{point}</Markdown></div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-1">Full Transcript</h3>
            <div className="max-h-48 overflow-y-auto bg-gray-50 rounded-lg p-3">
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{transcriptForExport}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
