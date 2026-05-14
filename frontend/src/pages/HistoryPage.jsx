import { useEffect, useMemo, useState } from "react";
import Navbar from "../components/Navbar";
import HistoryItem from "../components/HistoryItem";
import TranscriptAnalysisModal from "../components/TranscriptAnalysisModal";
import { useProcessingJobs } from "../context/ProcessingJobsContext";
import { compareTranscripts, mergeTranscripts } from "../services/api";
import { fetchHistory } from "../services/supabase";

export default function HistoryPage({ session }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [analysisMode, setAnalysisMode] = useState("");
  const [analysisResult, setAnalysisResult] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [analysisRecords, setAnalysisRecords] = useState([]);
  const { activeJobs } = useProcessingJobs();

  useEffect(() => {
    loadHistory();
  }, [session]);

  useEffect(() => {
    if (!activeJobs.length) return;
    const interval = setInterval(loadHistory, 4000);
    return () => clearInterval(interval);
  }, [activeJobs.length, session]);

  async function loadHistory() {
    try {
      const data = await fetchHistory(session.user.id);
      setRecords(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function toggleSelected(id) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id]
    );
  }

  async function runAnalysis(mode) {
    const selected = records.filter((record) => selectedIds.includes(record.id));
    setAnalysisMode(mode);
    setAnalysisRecords(selected);
    setAnalysisResult("");
    setAnalysisError("");
    setAnalysisLoading(true);

    try {
      const result = mode === "compare"
        ? await compareTranscripts(selected)
        : await mergeTranscripts(selected);
      setAnalysisResult(result);
    } catch (err) {
      setAnalysisError(err.message);
    } finally {
      setAnalysisLoading(false);
    }
  }

  const completedRecords = useMemo(
    () => records.filter((record) => (record.status || "completed") === "completed" && record.transcript),
    [records]
  );
  const selectedCount = selectedIds.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar session={session} />

      <main className="mx-auto max-w-5xl px-4 pb-10 sm:px-6">
        <div className="sticky top-[61px] z-40 -mx-4 mb-6 border-b border-gray-200 bg-gray-50/95 px-4 py-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-gray-50/85 sm:-mx-6 sm:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">History</h1>
              <p className="text-gray-500 mt-1 text-sm">Your past transcriptions and summaries.</p>
            </div>

            {completedRecords.length >= 2 && (
              <div className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-sm md:w-auto">
                <span className="px-2 text-sm font-medium text-gray-500">{selectedCount} selected</span>
                <button
                  onClick={() => runAnalysis("compare")}
                  disabled={selectedCount < 2 || analysisLoading}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Compare
                </button>
                <button
                  onClick={() => runAnalysis("merge")}
                  disabled={selectedCount < 2 || analysisLoading}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Merge
                </button>
              </div>
            )}
          </div>
        </div>

        {activeJobs.length > 0 && (
          <div className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-800">
            {activeJobs.length} transcript job{activeJobs.length > 1 ? "s are" : " is"} still processing. This page will refresh automatically.
          </div>
        )}

        {loading && (
          <div className="flex justify-center py-20">
            <svg className="animate-spin w-8 h-8 text-indigo-400" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {!loading && !error && records.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-500 font-medium">No transcripts yet</p>
            <p className="text-gray-400 text-sm mt-1">Upload an audio file to get started.</p>
          </div>
        )}

        {!loading && records.length > 0 && (
          <div className="flex flex-col gap-4">
            {records.map((record) => {
              const selectable = (record.status || "completed") === "completed" && Boolean(record.transcript);
              return (
                <HistoryItem
                  key={record.id}
                  record={record}
                  selectable={selectable}
                  selected={selectedIds.includes(record.id)}
                  onSelect={toggleSelected}
                />
              );
            })}
          </div>
        )}
      </main>

      <TranscriptAnalysisModal
        mode={analysisMode}
        result={analysisResult}
        records={analysisRecords}
        loading={analysisLoading}
        error={analysisError}
        onClose={() => setAnalysisMode("")}
      />
    </div>
  );
}
