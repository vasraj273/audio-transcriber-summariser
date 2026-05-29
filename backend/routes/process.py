import logging
import os
import tempfile
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from models.schemas import ProcessResponse
from services.gemini_service import transcribe_audio as gemini_transcribe_audio
from services.groq_service import (
    _build_speaker_transcript,
    analyze_sales_call,
    assess_transcription_quality,
    infer_speakers,
    languages_match,
    summarise_transcript,
    transcribe_audio as groq_transcribe_audio,
    translate_segments,
    translate_text,
)

logger = logging.getLogger(__name__)
router = APIRouter()

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a"}
MAX_FILE_SIZE_MB = 25


@router.post("/process", response_model=ProcessResponse)
async def process_audio(
    file: UploadFile = File(...),
    output_language: str = Form("English"),
    summary_focus: str = Form("General Summary"),
    summary_format: str = Form("Bullet Points"),
    summary_length: str = Form("Medium"),
    custom_focus: str = Form(""),
):
    _validate_file(file)
    tmp_path = await _save_temp_file(file)

    try:
        result = process_audio_file(
            tmp_path,
            {
                "output_language": output_language,
                "summary_focus": summary_focus,
                "summary_format": summary_format,
                "summary_length": summary_length,
                "custom_focus": custom_focus,
            },
        )
    finally:
        os.remove(tmp_path)

    return ProcessResponse(**result)


def process_audio_file(file_path: str, options: dict) -> dict:
    import time
    start_ts = time.perf_counter()
    transcription = _transcribe_with_fallback(file_path)
    quality = assess_transcription_quality(transcription)

    if not quality["is_supported"]:
        return {
            "transcript": "",
            "summary": quality["warning"],
            "key_points": [],
            "detected_language": transcription["language"],
            "transcript_segments": [],
            "speaker_transcript": "",
            "speaker_count": 0,
            "audio_type": quality["audio_type"],
            "quality_score": quality["quality_score"],
            "quality_flags": quality["quality_flags"],
            "warning": quality["warning"],
            "duration_seconds": transcription.get("duration", 0),
            "transcription_provider": transcription.get("transcription_provider") or "unknown",
            "processing_ms": int((time.perf_counter() - start_ts) * 1000),
        }

    try:
        summary_result = summarise_transcript(
            transcript=transcription["text"],
            output_language=options.get("output_language", "English"),
            focus=options.get("summary_focus", "General Summary"),
            format=options.get("summary_format", "Bullet Points"),
            length=options.get("summary_length", "Medium"),
            custom_focus=options.get("custom_focus", ""),
        )
        summary_warning = ""
    except Exception as exc:
        logger.warning("Summary generation failed (%s); returning transcript only.", exc)
        summary_result = {"summary": "Summary unavailable (AI quota or service error). Transcript was generated successfully.", "key_points": []}
        summary_warning = str(exc)
    speaker_result = _resolve_speakers(transcription)
    _maybe_translate_transcript(
        transcription=transcription,
        speaker_result=speaker_result,
        target_language=options.get("output_language", "English"),
    )

    sales_analysis = None
    try:
        sales_analysis = analyze_sales_call(
            transcript=transcription.get("text") or "",
            speaker_transcript=speaker_result.get("speaker_transcript") or "",
        )
    except Exception as exc:
        logger.warning("Sales analysis failed (%s); continuing without it.", exc)

    combined_warning = quality["warning"]
    if summary_warning:
        combined_warning = (combined_warning + " " if combined_warning else "") + "Summary unavailable right now. Transcript was saved successfully."

    processing_ms = int((time.perf_counter() - start_ts) * 1000)
    provider = transcription.get("transcription_provider") or "unknown"
    logger.info("[Analytics] transcription complete provider=%s duration=%.2fs processing_ms=%d", provider, transcription.get("duration", 0), processing_ms)

    return {
        "transcript": transcription["text"],
        "summary": summary_result["summary"],
        "key_points": summary_result["key_points"],
        "detected_language": transcription["language"],
        "transcript_segments": speaker_result["segments"],
        "speaker_transcript": speaker_result["speaker_transcript"],
        "speaker_count": speaker_result["speaker_count"],
        "audio_type": quality["audio_type"],
        "quality_score": quality["quality_score"],
        "quality_flags": quality["quality_flags"],
        "warning": combined_warning,
        "duration_seconds": transcription.get("duration", 0),
        "transcription_provider": provider,
        "processing_ms": processing_ms,
        "sales_analysis": sales_analysis,
    }


def _transcribe_with_fallback(file_path: str) -> dict:
    logger.info("Transcription pipeline starting for %s.", os.path.basename(file_path))
    try:
        result = gemini_transcribe_audio(file_path)
        if (result.get("text") or "").strip():
            result["transcription_provider"] = "gemini"
            return result
        logger.warning("Gemini returned empty transcript. Falling back to Groq Whisper.")
        last_error = "empty transcript"
    except Exception as exc:
        logger.warning(
            "Gemini transcription failed (%s). Falling back to Groq Whisper.",
            exc,
        )
        last_error = exc

    try:
        result = groq_transcribe_audio(file_path)
        result["transcription_provider"] = "groq_whisper"
        logger.info("Groq Whisper fallback transcription succeeded.")
        return result
    except Exception as fallback_exc:
        logger.exception("Both Gemini and Groq Whisper transcription failed.")
        raise RuntimeError(
            f"Transcription failed. Gemini error: {last_error}. Groq Whisper fallback error: {fallback_exc}."
        ) from fallback_exc


def _maybe_translate_transcript(
    *, transcription: dict, speaker_result: dict, target_language: str
) -> None:
    """Translate the transcript + segments + speaker_transcript in-place when
    the user picked a target language different from the detected source.
    No-op when ``target_language`` is ``"Same as Original"`` or the source
    already matches. Failures are swallowed — caller still gets the original
    transcript so a Llama outage never blocks a successful job."""
    if not target_language or target_language == "Same as Original":
        return
    detected_code = (transcription.get("language") or "").strip()
    if languages_match(detected_code, target_language):
        return

    segments = speaker_result.get("segments") or []
    try:
        if segments:
            translated_segments = translate_segments(segments, target_language)
            speaker_result["segments"] = translated_segments
            speaker_result["speaker_transcript"] = _build_speaker_transcript(translated_segments)
            joined = " ".join(
                (s.get("text") or "").strip() for s in translated_segments
            ).strip()
            if joined:
                transcription["text"] = joined
        elif transcription.get("text"):
            translated = translate_text(transcription["text"], target_language)
            if translated:
                transcription["text"] = translated
                speaker_result["speaker_transcript"] = translated
        logger.info(
            "Translation complete src=%s -> %s segments=%d",
            detected_code or "unknown",
            target_language,
            len(segments),
        )
    except Exception as exc:
        logger.warning("Translation pass failed (%s); serving original transcript.", exc)


def _resolve_speakers(transcription: dict) -> dict:
    segments = transcription.get("segments") or []
    text = transcription.get("text") or ""

    has_native_speakers = any((segment.get("speaker") or "").strip() for segment in segments)

    if has_native_speakers:
        labels = {segment["speaker"] for segment in segments if segment.get("speaker")}
        return {
            "speaker_transcript": _build_speaker_transcript(segments),
            "speaker_count": max(len(labels), 1),
            "segments": segments,
        }

    try:
        return infer_speakers(text, segments)
    except Exception:
        return {
            "speaker_transcript": text,
            "speaker_count": 1,
            "segments": [{**segment, "speaker": "Speaker 1"} for segment in segments],
        }


def _validate_file(file: UploadFile):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Please upload an mp3, wav, or m4a file.",
        )


async def _save_temp_file(file: UploadFile) -> str:
    ext = os.path.splitext(file.filename)[1].lower()
    contents = await file.read()

    if len(contents) > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"File is too large. Maximum size is {MAX_FILE_SIZE_MB}MB.",
        )

    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(contents)
        return tmp.name
