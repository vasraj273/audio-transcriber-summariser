import logging
import os
import time
from dotenv import load_dotenv
import assemblyai as aai

from services.analytics_service import record_api_call

load_dotenv()

logger = logging.getLogger(__name__)
_configured = False


def _ensure_configured() -> None:
    global _configured
    if _configured:
        return

    api_key = os.getenv("ASSEMBLYAI_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ASSEMBLYAI_API_KEY is not set. Add it to backend/.env locally and to the Render dashboard for production."
        )

    aai.settings.api_key = api_key
    _configured = True
    logger.info("AssemblyAI configured (key length=%d).", len(api_key))


def transcribe_audio(file_path: str) -> dict:
    _ensure_configured()

    config = aai.TranscriptionConfig(
        speech_model=aai.SpeechModel.best,
        speaker_labels=True,
        language_detection=True,
        punctuate=True,
        format_text=True,
    )

    logger.info("AssemblyAI transcription starting: %s", os.path.basename(file_path))
    started = time.perf_counter()

    try:
        transcript = aai.Transcriber().transcribe(file_path, config=config)
    except Exception as exc:
        logger.exception("AssemblyAI SDK raised during transcribe().")
        record_api_call(
            provider="assemblyai",
            endpoint="transcribe",
            success=False,
            rate_limited=_is_rate_limited(exc),
            duration_seconds=0,
            latency_ms=int((time.perf_counter() - started) * 1000),
            error_message=str(exc),
        )
        raise RuntimeError(f"AssemblyAI request failed: {exc}") from exc

    if transcript.status == aai.TranscriptStatus.error:
        logger.error("AssemblyAI returned error status: %s", transcript.error)
        record_api_call(
            provider="assemblyai",
            endpoint="transcribe",
            success=False,
            rate_limited=_is_rate_limited(transcript.error or ""),
            duration_seconds=0,
            latency_ms=int((time.perf_counter() - started) * 1000),
            error_message=str(transcript.error),
        )
        raise RuntimeError(f"AssemblyAI transcription failed: {transcript.error}")

    json_response = getattr(transcript, "json_response", None) or {}
    language = json_response.get("language_code") or "unknown"

    segments = _build_segments(transcript)
    duration = float(getattr(transcript, "audio_duration", None) or 0)
    if duration == 0 and segments:
        duration = max(segment["end"] for segment in segments)

    logger.info(
        "AssemblyAI transcription complete: id=%s language=%s segments=%d duration=%.2fs",
        getattr(transcript, "id", "?"),
        language,
        len(segments),
        duration,
    )

    record_api_call(
        provider="assemblyai",
        endpoint="transcribe",
        success=True,
        rate_limited=False,
        duration_seconds=duration,
        latency_ms=int((time.perf_counter() - started) * 1000),
    )

    return {
        "text": (transcript.text or "").strip(),
        "language": language,
        "segments": segments,
        "duration": duration,
    }


def _is_rate_limited(err) -> bool:
    text = str(err).lower()
    return "429" in text or "rate limit" in text or "rate_limit" in text or "quota" in text


def _build_segments(transcript) -> list:
    utterances = getattr(transcript, "utterances", None) or []
    if utterances:
        return [
            _format_utterance(utterance)
            for utterance in utterances
            if (utterance.text or "").strip()
        ]

    words = getattr(transcript, "words", None) or []
    if words:
        return _group_words_into_segments(words)

    text = (transcript.text or "").strip()
    if not text:
        return []

    return [{
        "start": 0.0,
        "end": float(getattr(transcript, "audio_duration", None) or 0),
        "text": text,
        "speaker": "Speaker 1",
    }]


def _format_utterance(utterance) -> dict:
    return {
        "start": _ms_to_seconds(utterance.start),
        "end": _ms_to_seconds(utterance.end),
        "text": (utterance.text or "").strip(),
        "speaker": _speaker_label(getattr(utterance, "speaker", None)),
    }


def _group_words_into_segments(words: list, max_gap: float = 1.5, max_duration: float = 12.0) -> list:
    segments = []
    current = None

    for word in words:
        start = _ms_to_seconds(word.start)
        end = _ms_to_seconds(word.end)
        speaker = _speaker_label(getattr(word, "speaker", None))
        text = (word.text or "").strip()
        if not text:
            continue

        if (
            current is None
            or speaker != current["speaker"]
            or (start - current["end"]) > max_gap
            or (end - current["start"]) > max_duration
        ):
            if current:
                segments.append(current)
            current = {"start": start, "end": end, "text": text, "speaker": speaker}
        else:
            current["end"] = end
            current["text"] = f"{current['text']} {text}".strip()

    if current:
        segments.append(current)

    return segments


def _ms_to_seconds(value) -> float:
    if value is None:
        return 0.0
    return round(float(value) / 1000.0, 3)


def _speaker_label(raw_speaker) -> str:
    if raw_speaker is None or raw_speaker == "":
        return "Speaker 1"

    raw = str(raw_speaker).strip()
    if raw.upper().startswith("SPEAKER"):
        digits = "".join(ch for ch in raw if ch.isdigit())
        return f"Speaker {int(digits)}" if digits else "Speaker 1"

    if len(raw) == 1 and raw.isalpha():
        return f"Speaker {ord(raw.upper()) - ord('A') + 1}"

    digits = "".join(ch for ch in raw if ch.isdigit())
    if digits:
        return f"Speaker {int(digits)}"

    return f"Speaker {raw}"
