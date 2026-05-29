import logging
import os
import tempfile
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from models.schemas import ProcessResponse
from services.audio_split_service import (
    SPLIT_THRESHOLD_SECONDS,
    get_duration_seconds,
    split_into_parts,
)
from services.gemini_service import transcribe_audio as gemini_transcribe_audio
from services.groq_service import (
    _build_speaker_transcript,
    analyze_sales_call,
    assess_transcription_quality,
    build_context_memory,
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
    """Pipeline entry. Short audio -> single pass. Long audio -> 3 equal
    sequential parts, each Gemini call primed with a distilled context memo
    from the prior parts, merged back into one transcription dict. The return
    shape ({text, language, segments, duration, transcription_provider}) is
    identical for both paths so downstream code is unaffected."""
    logger.info("Transcription pipeline starting for %s.", os.path.basename(file_path))

    try:
        duration = get_duration_seconds(file_path)
    except Exception as exc:
        logger.warning("Duration probe failed (%s); using single-pass.", exc)
        duration = 0.0

    if duration and duration < SPLIT_THRESHOLD_SECONDS:
        logger.info(
            "Audio %.1fs < %.0fs threshold; single-pass transcription.",
            duration, SPLIT_THRESHOLD_SECONDS,
        )
        return _transcribe_part(file_path)

    try:
        parts = split_into_parts(file_path)
    except Exception as exc:
        logger.warning("Audio split failed (%s); falling back to single-pass.", exc)
        return _transcribe_part(file_path)

    try:
        return _transcribe_parts_sequential(parts)
    finally:
        for part_path in parts:
            try:
                os.remove(part_path)
            except OSError:
                pass


def _transcribe_parts_sequential(parts: list) -> dict:
    """Transcribe each part in order, propagating a distilled context memo
    (topic / speakers / terminology / state) from all prior parts into the
    next part's Gemini prompt."""
    results = []
    context = ""
    for index, part_path in enumerate(parts):
        logger.info("Transcribing part %d/%d.", index + 1, len(parts))
        result = _transcribe_part(part_path, context=context)
        results.append(result)
        if index < len(parts) - 1:
            accumulated = " ".join((r.get("text") or "") for r in results).strip()
            context = build_context_memory(accumulated)
    return _merge_transcriptions(results)


def _transcribe_part(file_path: str, context: str = "") -> dict:
    """Gemini primary (context-aware) with Groq Whisper fallback for a single
    file — whole audio or one split part. Groq has no context channel, so a
    fallback part relies on post-merge speaker inference."""
    try:
        result = gemini_transcribe_audio(file_path, context=context)
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


def _merge_transcriptions(results: list) -> dict:
    """Concatenate part transcriptions in order. Each later part's segment
    timestamps restart near 0, so we offset them by the running max end to
    keep the merged timeline monotonic for the audio player and speaker
    logic. Preserves the {text, language, segments, duration} schema."""
    merged_segments = []
    text_chunks = []
    providers = []
    language = "unknown"
    offset = 0.0

    for result in results:
        segments = result.get("segments") or []
        part_max_end = offset
        for seg in segments:
            start = float(seg.get("start", 0) or 0) + offset
            end = float(seg.get("end", start) or start) + offset
            merged_segments.append({**seg, "start": round(start, 3), "end": round(end, 3)})
            part_max_end = max(part_max_end, end)

        if (result.get("text") or "").strip():
            text_chunks.append(result["text"].strip())
        if language == "unknown" and result.get("language") and result["language"] != "unknown":
            language = result["language"]
        if result.get("transcription_provider"):
            providers.append(result["transcription_provider"])

        # Advance offset by this part's span; if it had no segments, fall back
        # to its reported duration so the next part still lands after it.
        if part_max_end > offset:
            offset = part_max_end
        else:
            offset += float(result.get("duration", 0) or 0)

    duration = max((seg["end"] for seg in merged_segments), default=offset)
    unique_providers = list(dict.fromkeys(providers))
    if not unique_providers:
        provider = "unknown"
    elif len(unique_providers) == 1:
        provider = unique_providers[0]
    else:
        provider = "+".join(unique_providers)

    return {
        "text": " ".join(text_chunks).strip(),
        "language": language,
        "segments": merged_segments,
        "duration": duration,
        "transcription_provider": provider,
    }


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
