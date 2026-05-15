const FRIENDLY_MAP = [
  { match: /insufficient credits/i, message: "Insufficient credits remaining." },
  { match: /unsupported file type/i, message: "This file format isn't supported. Please upload MP3, WAV, or M4A." },
  { match: /too large|maximum size/i, message: "This file is too large. Maximum size is 25 MB." },
  { match: /429|rate limit|tokens per day|tokens per minute/i, message: "AI service is busy right now. Please retry in a few minutes." },
  { match: /assemblyai/i, message: "Transcription service is temporarily unavailable. We retried automatically." },
  { match: /summary unavailable/i, message: "Summary unavailable right now. Transcript was saved." },
  { match: /network|fetch failed|failed to fetch|net::/i, message: "Network problem. Check your connection and retry." },
  { match: /processing failed/i, message: "Unable to process audio. Please retry." },
];

export function friendlyError(raw) {
  if (!raw) return "Something went wrong. Please retry.";
  const text = typeof raw === "string" ? raw : (raw.message || String(raw));
  for (const { match, message } of FRIENDLY_MAP) {
    if (match.test(text)) return message;
  }
  const cleaned = text.replace(/\{[\s\S]*\}/g, "").replace(/Error code:?\s*\d+/i, "").trim();
  if (cleaned && cleaned.length < 200) return cleaned;
  return "Unable to process audio. Please retry.";
}
