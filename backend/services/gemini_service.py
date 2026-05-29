import logging
import os
import re
import time

from dotenv import load_dotenv
import google.generativeai as genai

from services.analytics_service import record_api_call

load_dotenv()

logger = logging.getLogger(__name__)

# 2.5 Flash gives transcription quality on par with the Gemini app, far
# better than 2.0 Flash for diarized verbatim speech. Override with
# GEMINI_TRANSCRIBE_MODEL if needed.
_MODEL = os.getenv("GEMINI_TRANSCRIBE_MODEL", "gemini-2.5-flash")
_configured = False

# Gemini's documented audio MIME types. m4a (AAC-in-MP4) is sent as audio/aac
# which the File API accepts; mislabelling as audio/mp4 gets rejected.
_MIME_BY_EXT = {
    ".mp3": "audio/mp3",
    ".wav": "audio/wav",
    ".m4a": "audio/aac",
}

# Average speaking rate used only to synthesise plausible segment timestamps
# when the model is asked for a clean verbatim transcript (no timestamps).
_WORDS_PER_SECOND = 2.6


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
    logger.info("Gemini configured (key length=%d, model=%s).", len(api_key), _MODEL)


# Plain-text transcription prompt. No JSON, no timestamps — this is what makes
# Gemini transcribe verbatim at app-level quality instead of looping/blobbing.
_PROMPT = """You are a professional audio transcriptionist. Transcribe the attached audio recording completely and accurately.

Strict rules:
- Transcribe VERBATIM, word for word. Do not summarise, paraphrase, translate, or omit anything.
- Write in the ORIGINAL spoken language. Never translate to English.
- Use correct, natural punctuation and capitalisation for that language.
- Identify each distinct speaker by their voice. Start every speaker turn on a new line, prefixed with a consistent label: "Speaker 1:", "Speaker 2:", etc. Keep the SAME label for the SAME voice throughout the entire recording — never renumber the same person.
- A two-person phone call must alternate between exactly "Speaker 1:" and "Speaker 2:". Do not collapse a multi-speaker conversation into a single speaker.
- If there is clearly only one speaker, label every line "Speaker 1:".
- Put each speaker turn (or each natural sentence within a long turn) on its own line.
- Do NOT repeat words or lines. Do NOT pad or loop. Transcribe each moment of audio exactly once.
- Do NOT add timestamps, headers, notes, or commentary. Output only the transcript lines.

Before the transcript, output a single first line in the exact form:
LANG: <ISO 639-1 code of the spoken language, e.g. en, es, hi, fr>

Then the transcript, starting on the next line. If there is no intelligible speech, output only:
LANG: unknown"""


def _wait_until_active(uploaded, timeout_s: float = 30.0):
    """Poll the uploaded File until it leaves PROCESSING. Generating before the
    file is ACTIVE yields empty/garbage transcripts."""
    deadline = time.time() + timeout_s
    while getattr(uploaded.state, "name", str(uploaded.state)) == "PROCESSING":
        if time.time() > deadline:
            break
        time.sleep(1.0)
        uploaded = genai.get_file(uploaded.name)
    return uploaded


def _build_prompt(context: str = "") -> str:
    """Prepend a prior-context block when transcribing a later split part, so
    Gemini keeps speaker labels, names, and terminology consistent across
    parts. Context is guidance only — never re-transcribed."""
    if not context.strip():
        return _PROMPT
    return (
        "PRIOR CONTEXT from earlier parts of this SAME recording. Use it ONLY "
        "to keep speaker labels (Speaker 1/2/...), names, roles, and "
        "terminology consistent. Do NOT re-transcribe or repeat any of it.\n"
        "---\n"
        f"{context.strip()}\n"
        "---\n\n"
        + _PROMPT
    )


def transcribe_audio(file_path: str, context: str = "") -> dict:
    _ensure_configured()

    started = time.perf_counter()
    ext = os.path.splitext(file_path)[1].lower()
    mime = _MIME_BY_EXT.get(ext, "audio/mp3")

    uploaded = None
    try:
        uploaded = genai.upload_file(path=file_path, mime_type=mime)
        uploaded = _wait_until_active(uploaded)
        if getattr(uploaded.state, "name", str(uploaded.state)) == "FAILED":
            raise RuntimeError("Gemini File API failed to process the audio upload.")

        model = genai.GenerativeModel(_MODEL)
        response = model.generate_content(
            [_build_prompt(context), uploaded],
            generation_config={
                "temperature": 0.0,
                "top_p": 0.95,
                "max_output_tokens": 8192,
            },
        )
        raw = (response.text or "")
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

    language, segments = _parse_transcript(raw)
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


_SPEAKER_LINE = re.compile(r"^\s*speaker\s*([0-9]+)\s*[:\-]\s*(.*)$", re.IGNORECASE)


def _parse_transcript(raw: str) -> tuple[str, list]:
    """Parse the LANG header + speaker-labelled lines into the segment schema.
    Synthesises monotonically increasing timestamps from speech rate so the
    audio player and downstream speaker logic keep working."""
    if not raw:
        return "unknown", []

    lines = raw.replace("\r\n", "\n").split("\n")
    language = "unknown"
    body_lines = []

    for i, line in enumerate(lines):
        stripped = line.strip()
        if not body_lines and stripped.upper().startswith("LANG:"):
            code = stripped.split(":", 1)[1].strip().lower()
            language = re.sub(r"[^a-z\-]", "", code) or "unknown"
            body_lines = lines[i + 1:]
            break
    else:
        body_lines = lines

    segments = []
    clock = 0.0
    current_speaker = "Speaker 1"

    for line in body_lines:
        stripped = line.strip()
        if not stripped:
            continue
        match = _SPEAKER_LINE.match(stripped)
        if match:
            current_speaker = f"Speaker {int(match.group(1))}"
            content = match.group(2).strip()
        else:
            content = stripped
        if not content:
            continue
        duration = max(1.0, len(content.split()) / _WORDS_PER_SECOND)
        start = round(clock, 3)
        end = round(clock + duration, 3)
        clock = end
        segments.append({
            "start": start,
            "end": end,
            "text": content,
            "speaker": current_speaker,
        })

    return language, segments


def _is_rate_limited(err) -> bool:
    text = str(err).lower()
    return "429" in text or "rate limit" in text or "rate_limit" in text or "quota" in text or "resource_exhausted" in text
