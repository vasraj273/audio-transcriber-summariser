import Markdown from "./Markdown";

export default function TranscriptAnalysisModal({ mode, result, loading, error, onClose }) {
  if (!mode) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="max-h-[88vh] w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <p className="text-lg font-semibold text-gray-900">
              {mode === "compare" ? "Transcript Comparison" : "Merged Transcript Notes"}
            </p>
            <p className="text-sm text-gray-500">AI-generated analysis from selected history records.</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            Close
          </button>
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
