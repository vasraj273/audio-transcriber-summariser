import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export async function saveTranscript({ userId, audioName, transcript, summary, keyPoints }) {
  const { error } = await supabase.from("transcripts").insert({
    user_id: userId,
    audio_name: audioName,
    transcript,
    summary,
    key_points: JSON.stringify(keyPoints),
  });
  if (error) console.error("[Supabase] Save failed:", error.message);
}

export async function fetchHistory(userId) {
  const { data, error } = await supabase
    .from("transcripts")
    .select("id, audio_name, transcript, summary, key_points, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error("Failed to load history.");

  return (data || []).map((record) => ({
    ...record,
    key_points: record.key_points ? JSON.parse(record.key_points) : [],
  }));
}
