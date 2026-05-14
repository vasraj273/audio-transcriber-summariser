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
    output_language: outputLanguage,
    focus,
    format,
    summary_length: summaryLength,
  };

  const { error } = await supabase.from("transcripts").insert(payload);
  if (error && error.message.toLowerCase().includes("speaker")) {
    const { speaker_transcript, speaker_count, ...fallbackPayload } = payload;
    const retry = await supabase.from("transcripts").insert(fallbackPayload);
    if (retry.error) console.error("[Supabase] Save failed:", retry.error.message);
    return;
  }

  if (error) console.error("[Supabase] Save failed:", error.message);
}

export async function fetchHistory(userId) {
  const fullColumns = "id, audio_name, transcript, summary, key_points, created_at, detected_language, output_language, focus, format, summary_length, speaker_transcript, speaker_count";
  const fallbackColumns = "id, audio_name, transcript, summary, key_points, created_at, detected_language, output_language, focus, format, summary_length";

  let { data, error } = await supabase
    .from("transcripts")
    .select(fullColumns)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error && error.message.toLowerCase().includes("speaker")) {
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
    key_points: record.key_points ? JSON.parse(record.key_points) : [],
    speaker_transcript: record.speaker_transcript || "",
    speaker_count: record.speaker_count || 1,
  }));
}
