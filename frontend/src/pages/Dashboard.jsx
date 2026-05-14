import { useEffect, useState } from "react";
import { processAudio } from "../services/api";
import { saveTranscript } from "../services/supabase";
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
  const [result, setResult] = useState(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState(null);
  const [options, setOptions] = useState(DEFAULT_OPTIONS);
  const [chatSessionId, setChatSessionId] = useState(0);
  const [audioUrl, setAudioUrl] = useState("");

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  async function handleSubmit(file) {
    setLoading(true);
    setError(null);
    setResult(null);
    setFileName(file.name);
    setChatSessionId((id) => id + 1);
    setAudioUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return "";
    });

    try {
      const data = await processAudio(file, options);
      const nextAudioUrl = URL.createObjectURL(file);
      setAudioUrl(nextAudioUrl);
      setResult(data);
      if (session?.user?.id) {
        await saveTranscript({
          userId: session.user.id,
          audioName: file.name,
          transcript: data.transcript,
          summary: data.summary,
          keyPoints: data.key_points,
          detectedLanguage: data.detected_language,
          speakerTranscript: data.speaker_transcript,
          speakerCount: data.speaker_count,
          outputLanguage: options.outputLanguage,
          focus: options.focus,
          format: options.format,
          summaryLength: options.length,
        });
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

        <CustomizationPanel options={options} setOptions={setOptions} disabled={loading} />

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
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm text-gray-500">
                  Results for <span className="font-medium text-gray-700">{fileName}</span>
                </p>
                {result.detected_language && (
                  <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-medium px-2.5 py-1 rounded-full border border-indigo-100">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                    </svg>
                    Detected: {capitalize(result.detected_language)}
                  </span>
                )}
              </div>
              <button
                onClick={() => downloadPDF({
                  audioName: fileName,
                  createdAt: new Date().toISOString(),
                  transcript: transcriptForContext,
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
              <TranscriptBox
                transcript={result.transcript}
                speakerTranscript={speakerTranscript}
                speakerCount={result.speaker_count}
                transcriptSegments={result.transcript_segments}
                audioUrl={audioUrl}
              />
            </div>

            <ChatPanel
              key={chatSessionId}
              transcript={transcriptForContext}
              summary={result.summary}
            />
          </div>
        )}
      </main>
    </div>
  );
}

function capitalize(s) {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
