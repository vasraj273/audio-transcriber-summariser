import { useState } from "react";
import { processAudio } from "../services/api";
import { downloadPDF } from "../utils/downloadPDF";
import Navbar from "../components/Navbar";
import AudioUploader from "../components/AudioUploader";
import TranscriptBox from "../components/TranscriptBox";
import SummaryBox from "../components/SummaryBox";
import KeyPointsList from "../components/KeyPointsList";

export default function Dashboard({ session }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState(null);

  async function handleSubmit(file) {
    setLoading(true);
    setError(null);
    setResult(null);
    setFileName(file.name);

    try {
      const token = session?.access_token;
      const data = await processAudio(file, token);
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar session={session} />

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-800">Transcribe & Summarise</h1>
          <p className="text-gray-500 mt-1 text-sm">
            Upload an audio file to get a transcript, summary, and key points.
          </p>
        </div>

        <AudioUploader onSubmit={handleSubmit} loading={loading} />

        {error && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {loading && (
          <div className="mt-10 text-center">
            <p className="text-gray-500 text-sm animate-pulse">
              Transcribing and summarising your audio — this may take up to 30 seconds...
            </p>
          </div>
        )}

        {result && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-gray-500">Results for <span className="font-medium text-gray-700">{fileName}</span></p>
              <button
                onClick={() => downloadPDF({
                  audioName: fileName,
                  createdAt: new Date().toISOString(),
                  transcript: result.transcript,
                  summary: result.summary,
                  keyPoints: result.key_points,
                })}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download PDF
              </button>
            </div>

            <div className="flex flex-col gap-6">
              <SummaryBox summary={result.summary} />
              <KeyPointsList keyPoints={result.key_points} />
              <TranscriptBox transcript={result.transcript} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
