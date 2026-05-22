import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useProcessingJobs } from "../context/ProcessingJobsContext";
import { useCredits } from "../context/CreditsContext";
import { computeRequiredCredits } from "../utils/credits";
import { downloadPDF } from "../utils/downloadPDF";
import { friendlyError } from "../utils/errorMessage";
import { createLeadFromAnalysis } from "../services/supabase";
import Navbar from "../components/Navbar";
import AudioUploader from "../components/AudioUploader";
import CustomizationPanel from "../components/CustomizationPanel";
import TranscriptBox from "../components/TranscriptBox";
import SummaryBox from "../components/SummaryBox";
import KeyPointsList from "../components/KeyPointsList";
import ChatPanel from "../components/ChatPanel";
import ProcessingStages from "../components/ProcessingStages";
import SalesAnalysisPanel from "../components/SalesAnalysisPanel";

const DEFAULT_OPTIONS = {
  outputLanguage: "English",
  focus: "General Summary",
  format: "Bullet Points",
  length: "Medium",
  customFocus: "",
};

export default function Dashboard({ session }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [currentJobId, setCurrentJobId] = useState("");
  const [error, setError] = useState(null);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [chatSessionId, setChatSessionId] = useState(0);
  const [leadSavedId, setLeadSavedId] = useState("");
  const [leadSaving, setLeadSaving] = useState(false);
  const { jobs, startJob } = useProcessingJobs();
  const { remaining, deduct } = useCredits();

  async function handleSaveAsLead(analysis) {
    if (!session?.user?.id || !analysis) return;
    try {
      setLeadSaving(true);
      setError(null);
      const lead = await createLeadFromAnalysis({
        userId: session.user.id,
        analysis,
        transcriptId: currentJob?.record_id || currentJob?.id || null,
      });
      setLeadSavedId(lead.id);
    } catch (err) {
      setError(friendlyError(err.message));
    } finally {
      setLeadSaving(false);
    }
  }

  const currentJob = jobs.find((job) => job.job_id === currentJobId) || jobs[0];
  const result = currentJob?.result || null;
  const isProcessing = Boolean(currentJob && ["queued", "processing"].includes(currentJob.status));

  async function handleSubmit(file, durationSeconds) {
    const required = computeRequiredCredits(durationSeconds);
    console.info("[Dashboard] handleSubmit", { durationSeconds, required, remaining, userId: session?.user?.id });
    if (required > remaining) {
      setError("Insufficient credits remaining.");
      return;
    }

    setLoading(true);
    setError(null);
    setChatSessionId((id) => id + 1);
    setLeadSavedId("");

    try {
      const job = await startJob({ file, userId: session.user.id, options });
      console.info("[Dashboard] startJob returned", { job_id: job?.job_id, record_id: job?.record_id, status: job?.status });
      setCurrentJobId(job.job_id);
      if (required > 0 && job?.job_id) {
        try {
          const deductResult = await deduct({ jobId: job.job_id, recordId: job.record_id, amount: required });
          console.info("[Dashboard] post-deduct", { deductResult });
        } catch (err) {
          setError(friendlyError(err.message || "Credits could not be deducted."));
          console.error("[Dashboard] Deduction failed:", err.message);
        }
      }
    } catch (err) {
      setError(friendlyError(err.message));
      console.error("[Dashboard] handleSubmit error:", err.message);
    } finally {
      setLoading(false);
    }
  }

  const speakerTranscript = result?.speaker_transcript || "";
  const hasSpeakerTranscript = Boolean(result?.speaker_count >= 2 && speakerTranscript.trim());
  const transcriptForContext = hasSpeakerTranscript ? speakerTranscript : result?.transcript;
  const hasUsableTranscript = Boolean(result?.transcript);

  return (
    <div className="min-h-screen bg-ink-50">
      <Navbar session={session} />

      <main className="app-container pb-12">
        <header className="flex flex-wrap items-end justify-between gap-4 pt-8 pb-6 mb-6 border-b border-ink-200">
          <div>
            <p className="eyebrow">Pipeline</p>
            <h1 className="h-display text-[28px] sm:text-[32px] mt-1.5">Transcribe & summarise</h1>
            <p className="text-[13.5px] text-ink-500 mt-2 max-w-xl">
              Upload a sales call. Get a transcript, summary, key points, and a full sales-intelligence breakdown.
            </p>
          </div>
          <div className="flex items-center gap-2 pill pill-success">
            <span className="w-1.5 h-1.5 rounded-full bg-success-500" />
            <span>AI ready</span>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch rise">
          <section className="card overflow-hidden flex flex-col">
            <div className="px-7 py-5 border-b border-ink-100 flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Step 1</p>
                <p className="h-section mt-0.5">Upload sales call</p>
              </div>
              <span className="pill pill-neutral">MP3 · WAV · M4A · max 25MB</span>
            </div>
            <div className="px-7 py-7 flex-1">
              <AudioUploader onSubmit={handleSubmit} loading={loading || isProcessing} creditsRemaining={remaining} />
            </div>
          </section>

          <section className="card overflow-hidden flex flex-col">
            <div className="px-7 py-5 border-b border-ink-100 flex items-center justify-between gap-3">
              <div>
                <p className="eyebrow">Step 2</p>
                <p className="h-section mt-0.5">Customise output</p>
              </div>
              <span className="pill pill-neutral">Optional</span>
            </div>
            <div className="px-7 py-7 flex-1">
              <CustomizationPanel options={options} setOptions={setOptions} disabled={loading || isProcessing} />
            </div>
          </section>
        </div>

        {error && (
          <div className="mt-6 card-tight bg-danger-50 border-danger-500/20 px-4 py-3 flex items-center gap-3">
            <svg className="w-4 h-4 text-danger-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <p className="text-[13.5px] text-danger-600">{error}</p>
          </div>
        )}

        {(loading || isProcessing) && (
          <ProcessingStages
            starting={loading}
            status={currentJob?.status}
            hasResult={Boolean(currentJob?.result)}
          />
        )}

        {result && (
          <div className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[13px] text-ink-500">
                  Results for <span className="text-ink-900 font-medium">{currentJob?.audio_name}</span>
                </p>
                {result.detected_language && (
                  <span className="pill pill-brand">{capitalize(result.detected_language)}</span>
                )}
                {result.audio_type && (
                  <span className="pill pill-neutral">{result.audio_type.replaceAll("_", " ")}</span>
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
                  className="btn btn-primary"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
                  </svg>
                  Download PDF
                </button>
              )}
            </div>

            {(result.audio_type === "music_song" || result.audio_type === "empty_audio") ? (
              <UnsupportedAudioNotice result={result} />
            ) : (
              <>
                {result.warning && (
                  <div className="mb-4 card-tight bg-warning-50 border-warning-500/30 px-4 py-3 flex items-center gap-3">
                    <svg className="w-4 h-4 text-warning-600 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    <p className="text-[13.5px] text-warning-600">{result.warning}</p>
                  </div>
                )}
                <div className="flex flex-col gap-6">
                  <SummaryBox summary={result.summary} />
                  {result.sales_analysis && (
                    <div>
                      <SalesAnalysisPanel
                        analysis={result.sales_analysis}
                        onCreateLead={leadSavedId ? null : handleSaveAsLead}
                      />
                      {leadSaving && (
                        <p className="mt-3 text-[12.5px] text-ink-500">Saving lead…</p>
                      )}
                      {leadSavedId && (
                        <div className="mt-3 card-tight bg-success-50 border-success-500/20 px-4 py-3 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-[13.5px] text-success-600">
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="font-medium">Lead saved.</span>
                          </div>
                          <button
                            onClick={() => navigate("/sales-assistant/leads")}
                            className="text-[13px] font-semibold text-success-600 hover:text-success-500 transition-colors"
                          >
                            View in leads →
                          </button>
                        </div>
                      )}
                    </div>
                  )}
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
