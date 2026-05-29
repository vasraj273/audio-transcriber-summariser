import json
import logging
import os
import re
import time

from dotenv import load_dotenv
import google.generativeai as genai

from services.analytics_service import record_api_call

load_dotenv()

logger = logging.getLogger(__name__)

_MODEL = "gemini-2.0-flash"
_configured = False

# MIME type lookup for the formats the upload pipeline already validates.
_MIME_BY_EXT = {
    ".mp3": "audio/mp3",
    ".wav": "audio/wav",
    ".m4a": "audio/mp4",
}


def _ensure_configured() -> None:
    global _configured
    if _configured:
        return
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to backend/.env locally and to the Render dashboard for production."
        )
    genai.configure(api_key=api_key)
    _configured = True
    logger.info("Gemini configured (key length=%d).", len(api_key))


_PROMPT = """You are a precise speech-to-text engine. Transcribe the supplied audio.

Rules:
- Transcribe verbatim. Do NOT summarise, translate, or add commentary.
- Detect distinct speakers and label them "Speaker 1", "Speaker 2", etc. Keep labels consistent across the whole call.
- Split the transcript into segments at every speaker change or natural sentence boundary.
- Give approximate start and end timestamps in SECONDS (numbers) for each segment, based on audio position.
- Detect the spoken language and return its ISO 639-1 code (e.g. "en", "es", "hi").

Return ONLY valid JSON, no markdown fences, in exactly this shape:
{
  "language": "<iso code>",
  "segments": [
    {"start": 0.0, "end": 4.2, "speaker": "Speaker 1", "text": "..."}
  ]
}
If there is no intelligible speech, return {"language": "unknown", "segments": []}.
"""


def transcribe_audio(file_path: str) -> dict:
    _ensure_configured()

    started = time.perf_counter()
    ext = os.path.splitext(file_path)[1].lower()
    mime = _MIME_BY_EXT.get(ext, "audio/mpeg")

    uploaded = None
    try:
        uploaded = genai.upload_file(path=file_path, mime_type=mime)
        model = genai.GenerativeModel(_MODEL)
        response = model.generate_content(
            [_PROMPT, uploaded],
            generation_config={"temperature": 0.0, "response_mime_type": "application/json"},
        )
        raw = response.text or ""
    except Exception as exc:
        logger.exception("Gemini transcription failed.")
        record_api_call(
            provider="gemini",
            endpoint=_MODEL,
            success=False,
            rate_limited=_is_rate_limited(exc),
            duration_seconds=0,
            latency_ms=int((time.perf_counter() - started) * 1000),
            error_message=str(exc),
        )
        raise RuntimeError(f"Gemini transcription failed: {exc}") from exc
    finally:
        if uploaded is not None:
            try:
                genai.delete_file(uploaded.name)
            except Exception:
                pass

    parsed = _safe_extract_json_object(raw)
    language = "unknown"
    segments = []
    if parsed:
        language = (parsed.get("language") or "unknown").strip() or "unknown"
        segments = _normalise_segments(parsed.get("segments"))

    text = " ".join(seg["text"] for seg in segments).strip()
    duration = max((seg["end"] for seg in segments), default=0.0)

    logger.info(
        "Gemini transcription complete: language=%s segments=%d duration=%.2fs",
        language, len(segments), duration,
    )
    record_api_call(
        provider="gemini",
        endpoint=_MODEL,
        success=True,
        rate_limited=False,
        duration_seconds=duration,
        latency_ms=int((time.perf_counter() - started) * 1000),
    )

    return {
        "text": text,
        "language": language,
        "segments": segments,
        "duration": duration,
    }


def _normalise_segments(raw_segments) -> list:
    if not isinstance(raw_segments, list):
        return []
    segments = []
    fallback_clock = 0.0
    for item in raw_segments:
        if not isinstance(item, dict):
            continue
        text = str(item.get("text", "")).strip()
        if not text:
            continue
        start = _to_float(item.get("start"), fallback_clock)
        end = _to_float(item.get("end"), start + 3.0)
        if end < start:
            end = start
        fallback_clock = end
        segments.append({
            "start": round(start, 3),
            "end": round(end, 3),
            "text": text,
            "speaker": _speaker_label(item.get("speaker")),
        })
    return segments


def _to_float(value, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _speaker_label(raw_speaker) -> str:
    if raw_speaker is None or raw_speaker == "":
        return "Speaker 1"
    raw = str(raw_speaker).strip()
    digits = "".join(ch for ch in raw if ch.isdigit())
    if digits:
        return f"Speaker {int(digits)}"
    if len(raw) == 1 and raw.isalpha():
        return f"Speaker {ord(raw.upper()) - ord('A') + 1}"
    return "Speaker 1"


def _safe_extract_json_object(raw: str) -> dict | None:
    if not raw:
        return None
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z0-9]*\n?", "", text)
        text = re.sub(r"\n?```$", "", text)
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        data = json.loads(text[start : end + 1])
    except Exception:
        return None
    return data if isinstance(data, dict) else None


def _is_rate_limited(err) -> bool:
    text = str(err).lower()
    return "429" in text or "rate limit" in text or "rate_limit" in text or "quota" in text or "resource_exhausted" in text
