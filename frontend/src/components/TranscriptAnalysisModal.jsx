import { useState } from "react";
import { downloadMergedNotesPDF } from "../utils/downloadPDF";
import Markdown from "./Markdown";

export default function TranscriptAnalysisModal({ mode, result, records = [], loading, error, onClose }) {
  const [pdfLoading, setPdfLoading] = useState(false);

  if (!mode) return null;

  async function handleDownloadPDF() {
    if (!result || mode !== "merge") return;
    setPdfLoading(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 0));
      downloadMergedNotesPDF({
        notes: result,
        records,
        generatedAt: new Date(),
      });
    } finally {
      setPdfLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-lg font-semibold text-gray-900">
              {mode === "compare" ? "Transcript Comparison" : "Merged Transcript Notes"}
            </p>
            <p className="text-sm text-gray-500">AI-generated analysis from selected history records.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mode === "merge" && (
              <button
                onClick={handleDownloadPDF}
                disabled={!result || loading || pdfLoading}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {pdfLoading ? "Generating PDF..." : "Download PDF"}
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            >
              Close
            </button>
          </div>
        </div>

        <div className="max-h-[72vh] overflow-y-auto p-6">
          {loading && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-5 text-sm text-indigo-700">
              Generating analysis...
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
              {error}
            </div>
          )}
          {result && (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
              <Markdown>{result}</Markdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
