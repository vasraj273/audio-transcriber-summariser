import { useState } from "react";
import { useProcessingJobs } from "../context/ProcessingJobsContext";
import { useCredits } from "../context/CreditsContext";
import { computeRequiredCredits } from "../utils/credits";
import { downloadPDF } from "../utils/downloadPDF";
import Navbar from "../components/Navbar";
import AudioUploader from "../components/AudioUploader";
import CustomizationPanel from "../components/CustomizationPanel";
import TranscriptBox from "../components/TranscriptBox";
import SummaryBox from "../components/SummaryBox";
import KeyPointsList from "../components/KeyPointsList";
import ChatPanel from "../components/ChatPanel";

const DEFAULT_OPTIONS = {
  outputLanguage: "English",
  focus: "General Summary",
  format: "Bullet Points",
  length: "Medium",
  customFocus: "",
};

export default function Dashboard({ session }) {
  const [loading, setLoading] = useState(false);
  const [currentJobId, setCurrentJobId] = useState("");
  const [error, setError] = useState(null);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [chatSessionId, setChatSessionId] = useState(0);
  const { jobs, startJob } = useProcessingJobs();
  const { remaining, deduct } = useCredits();

  const currentJob = jobs.find((job) => job.job_id === currentJobId) || jobs[0];
  const result = currentJob?.result || null;
  const isProcessing = Boolean(currentJob && ["queued", "processing"].includes(currentJob.status));

  async function handleSubmit(file, durationSeconds) {
    const required = computeRequiredCredits(durationSeconds);
    if (required > remaining) {
      setError("Insufficient credits remaining.");
      return;
    }

    setLoading(true);
    setError(null);
    setChatSessionId((id) => id + 1);

    try {
      const job = await startJob({ file, userId: session.user.id, options });
      setCurrentJobId(job.job_id);
      if (required > 0 && job?.job_id) {
        try {
          await deduct({ jobId: job.job_id, recordId: job.record_id, amount: required });
        } catch (err) {
          setError(err.message || "Credits could not be deducted.");
          console.error("[Credits] Deduction failed:", err.message);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const speakerTranscript = result?.speaker_transcript || "";
  const hasSpeakerTranscript = Boolean(result?.speaker_count >= 2 && speakerTranscript.trim());
  const transcriptForContext = hasSpeakerTranscript ? speakerTranscript : result?.transcript;
  const hasUsableTranscript = Boolean(result?.transcript);

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar session={session} />

      <main className="mx-auto max-w-4xl px-4 pb-10 sm:px-6">
        <div className="sticky top-[61px] z-40 -mx-4 mb-6 border-b border-gray-200 bg-gray-50/95 px-4 py-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-gray-50/85 sm:-mx-6 sm:px-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold text-gray-800">Transcribe & Summarise</h1>
            <p className="text-gray-500 text-sm">
              Upload an audio file to get a transcript, summary, and key points.
            </p>
          </div>
        </div>

        <CustomizationPanel options={options} setOptions={setOptions} disabled={loading || isProcessing} />

        <AudioUploader onSubmit={handleSubmit} loading={loading || isProcessing} creditsRemaining={remaining} />

        {error && (
          <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            {error}
          </div>
        )}

        {(loading || isProcessing) && <ProcessingStatus job={currentJob} starting={loading} />}

        {result && (
          <div className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-gray-500">
                  Results for <span className="font-medium text-gray-700">{currentJob?.audio_name}</span>
                </p>
                {result.detected_language && (
                  <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-medium px-2.5 py-1 rounded-full border border-indigo-100">
                    Detected: {capitalize(result.detected_language)}
                  </span>
                )}
                {result.audio_type && (
                  <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 text-xs font-medium px-2.5 py-1 rounded-full border border-gray-200">
                    {result.audio_type.replaceAll("_", " ")}
                  </span>
                )}
              </div>

              {hasUsableTranscript && (
                <button
                  onClick={() => downloadPDF({
                    audioName: currentJob?.audio_name,
                    createdAt: new Date().toISOString(),
                    transcript: transcriptForContext,
                    summary: result.summary,
                    keyPoints: result.key_points,
                  })}
                  className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
                >
                  Download PDF
                </button>
              )}
            </div>

            {result.warning ? (
              <UnsupportedAudioNotice result={result} />
            ) : (
              <>
                <div className="flex flex-col gap-6">
                  <SummaryBox summary={result.summary} />
                  <KeyPointsList keyPoints={result.key_points} />
                  <TranscriptBox
                    transcript={result.transcript}
                    speakerTranscript={speakerTranscript}
                    speakerCount={result.speaker_count}
                    transcriptSegments={result.transcript_segments}
                    audioUrl={currentJob?.audioUrl}
                  />
                </div>

                <ChatPanel
                  key={chatSessionId}
                  transcript={transcriptForContext}
                  summary={result.summary}
                />
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function ProcessingStatus({ job, starting }) {
  const status = starting ? "uploading" : job?.status || "queued";
  const label = status === "queued" ? "Queued" : status === "processing" ? "Processing" : "Uploading";

  return (
    <div className="mt-8 rounded-xl border border-indigo-100 bg-indigo-50 p-5">
      <div className="flex items-center gap-3">
        <svg className="h-5 w-5 animate-spin text-indigo-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-indigo-900">{label} audio</p>
          <p className="text-sm text-indigo-700">
            You can open History or leave this page. Processing will continue in the background.
          </p>
        </div>
      </div>
    </div>
  );
}

function UnsupportedAudioNotice({ result }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
      <p className="text-base font-semibold text-amber-900">Transcription not reliable for this audio</p>
      <p className="mt-2 text-sm text-amber-800">{result.warning}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-amber-700 border border-amber-200">
          Type: {result.audio_type}
        </span>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-medium text-amber-700 border border-amber-200">
          Quality: {Math.round((result.quality_score || 0) * 100)}%
        </span>
      </div>
    </div>
  );
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
