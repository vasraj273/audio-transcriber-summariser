import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export async function saveTranscript({
  userId,
  audioName,
  transcript,
  summary,
  keyPoints,
  detectedLanguage,
  speakerTranscript,
  speakerCount,
  outputLanguage,
  focus,
  format,
  summaryLength,
  status = "completed",
  audioType = "",
  qualityScore = 1,
  qualityFlags = [],
  transcriptSegments = [],
  errorMessage = "",
}) {
  const payload = {
    user_id: userId,
    audio_name: audioName,
    transcript,
    summary,
    key_points: JSON.stringify(keyPoints),
    detected_language: detectedLanguage,
    speaker_transcript: speakerTranscript,
    speaker_count: speakerCount,
    status,
    audio_type: audioType,
    quality_score: qualityScore,
    quality_flags: JSON.stringify(qualityFlags),
    transcript_segments: JSON.stringify(transcriptSegments),
    error_message: errorMessage,
    output_language: outputLanguage,
    focus,
    format,
    summary_length: summaryLength,
  };

  const { error } = await supabase.from("transcripts").insert(payload);
  if (error && /speaker|status|audio_type|quality|transcript_segments|error_message/i.test(error.message)) {
    const {
      speaker_transcript,
      speaker_count,
      status,
      audio_type,
      quality_score,
      quality_flags,
      transcript_segments,
      error_message,
      ...fallbackPayload
    } = payload;
    const retry = await supabase.from("transcripts").insert(fallbackPayload);
    if (retry.error) console.error("[Supabase] Save failed:", retry.error.message);
    return;
  }

  if (error) console.error("[Supabase] Save failed:", error.message);
}

export async function fetchHistory(userId) {
  const fullColumns = "id, job_id, audio_name, transcript, summary, key_points, created_at, detected_language, output_language, focus, format, summary_length, speaker_transcript, speaker_count, status, error_message, audio_type, quality_score, quality_flags, duration_seconds, transcript_segments";
  const fallbackColumns = "id, audio_name, transcript, summary, key_points, created_at, detected_language, output_language, focus, format, summary_length";

  let { data, error } = await supabase
    .from("transcripts")
    .select(fullColumns)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error && /speaker|status|audio_type|quality|duration|transcript_segments|job_id|error_message/i.test(error.message)) {
    const retry = await supabase
      .from("transcripts")
      .select(fallbackColumns)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    data = retry.data;
    error = retry.error;
  }

  if (error) throw new Error("Failed to load history.");

  return (data || []).map((record) => ({
    ...record,
    key_points: parseJson(record.key_points, []),
    quality_flags: parseJson(record.quality_flags, []),
    transcript_segments: parseJson(record.transcript_segments, []),
    speaker_transcript: record.speaker_transcript || "",
    speaker_count: record.speaker_count || 1,
    status: record.status || "completed",
    audio_type: record.audio_type || "",
    quality_score: record.quality_score || 0,
    error_message: record.error_message || "",
    duration_seconds: record.duration_seconds || 0,
  }));
}

function parseJson(value, fallback) {
  if (!value) return fallback;
  if (Array.isArray(value) || typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export async function deleteTranscript(recordId) {
  const { error } = await supabase.from("transcripts").delete().eq("id", recordId);
  if (error) throw new Error(error.message || "Failed to delete transcript.");
}
