import logging
import os
import tempfile
import uuid
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from models.schemas import JobCreateResponse, JobStatusResponse
from routes.process import process_audio_file
from services.analytics_service import record_transcript_event
from services.supabase_service import (
    complete_transcript,
    create_processing_transcript,
    fail_transcript,
    get_transcript_by_job,
    mark_transcript_processing,
    touch_user_active,
)

logger = logging.getLogger(__name__)

router = APIRouter()

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a"}
MAX_FILE_SIZE_MB = 25
JOBS = {}


@router.post("/jobs", response_model=JobCreateResponse)
async def create_job(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user_id: str = Form(...),
    output_language: str = Form("English"),
    summary_focus: str = Form("General Summary"),
    summary_format: str = Form("Bullet Points"),
    summary_length: str = Form("Medium"),
    custom_focus: str = Form(""),
):
    if not user_id.strip():
        raise HTTPException(status_code=400, detail="User id is required.")

    _validate_file(file)
    tmp_path = await _save_temp_file(file)
    job_id = str(uuid.uuid4())
    options = {
        "output_language": output_language,
        "summary_focus": summary_focus,
        "summary_format": summary_format,
        "summary_length": summary_length,
        "custom_focus": custom_focus,
    }

    try:
        record_id = create_processing_transcript(
            job_id=job_id,
            user_id=user_id,
            audio_name=file.filename,
            options=options,
        )
    except Exception as exc:
        _safe_remove(tmp_path)
        raise HTTPException(status_code=500, detail=f"Could not create processing job: {exc}")

    try:
        touch_user_active(user_id)
    except Exception:
        pass

    JOBS[job_id] = {
        "job_id": job_id,
        "record_id": record_id,
        "user_id": user_id,
        "status": "queued",
        "audio_name": file.filename,
    }
    background_tasks.add_task(_run_job, job_id, tmp_path, options)
    return JobCreateResponse(job_id=job_id, record_id=record_id, status="queued")


@router.get("/jobs/{job_id}", response_model=JobStatusResponse)
def get_job(job_id: str):
    record = get_transcript_by_job(job_id)
    if record:
        return _job_response_from_record(record)

    job = JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return JobStatusResponse(**job)


def _run_job(job_id: str, tmp_path: str, options: dict) -> None:
    job_meta = JOBS.get(job_id, {})
    record_id = job_meta.get("record_id")
    user_id = job_meta.get("user_id")
    try:
        JOBS[job_id]["status"] = "processing"
        mark_transcript_processing(job_id)
        result = process_audio_file(tmp_path, options)
        complete_transcript(job_id, result)
        JOBS[job_id] = {**JOBS[job_id], **result, "status": "completed"}
        _emit_transcript_event(
            transcript_id=record_id,
            job_id=job_id,
            user_id=user_id,
            result=result,
            status="completed",
            error_message=None,
        )
    except Exception as exc:
        message = str(exc) or "Processing failed."
        JOBS[job_id] = {**JOBS.get(job_id, {"job_id": job_id}), "status": "failed", "error_message": message}
        fail_transcript(job_id, message)
        _emit_transcript_event(
            transcript_id=record_id,
            job_id=job_id,
            user_id=user_id,
            result={},
            status="failed",
            error_message=message,
        )
    finally:
        _safe_remove(tmp_path)


def _emit_transcript_event(
    *,
    transcript_id: str | None,
    job_id: str,
    user_id: str | None,
    result: dict,
    status: str,
    error_message: str | None,
) -> None:
    """Persist one analytics_events row. Reads credits_used back from the
    `transcripts` row because frontend stamps it after deduct."""
    credits_used = 0
    try:
        record = get_transcript_by_job(job_id) or {}
        credits_used = int(record.get("credits_used") or 0)
        if not transcript_id:
            transcript_id = record.get("id")
    except Exception as exc:
        logger.warning("[Analytics] could not re-read transcript row for credits_used: %s", exc)

    try:
        record_transcript_event(
            transcript_id=transcript_id,
            job_id=job_id,
            user_id=user_id,
            duration_seconds=float(result.get("duration_seconds") or 0),
            language=result.get("detected_language"),
            audio_type=result.get("audio_type"),
            provider_used=result.get("transcription_provider"),
            credits_used=credits_used,
            processing_ms=result.get("processing_ms"),
            transcript_status=status,
            error_message=error_message,
        )
    except Exception as exc:
        # Loud log only - we already updated transcript status, and analytics
        # failure should never mask a successful transcript.
        logger.error("[Analytics] record_transcript_event failed job_id=%s: %s", job_id, exc)


def _job_response_from_record(record: dict) -> JobStatusResponse:
    return JobStatusResponse(
        job_id=record.get("job_id") or "",
        record_id=record.get("id") or "",
        status=record.get("status") or "completed",
        audio_name=record.get("audio_name") or "",
        transcript=record.get("transcript") or "",
        summary=record.get("summary") or "",
        key_points=record.get("key_points") or [],
        detected_language=record.get("detected_language") or "",
        transcript_segments=record.get("transcript_segments") or [],
        speaker_transcript=record.get("speaker_transcript") or "",
        speaker_count=record.get("speaker_count") or 1,
        audio_type=record.get("audio_type") or "",
        quality_score=record.get("quality_score") or 0,
        quality_flags=record.get("quality_flags") or [],
        error_message=record.get("error_message") or "",
        warning=record.get("error_message") or "",
        sales_analysis=record.get("sales_analysis") or None,
    )


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


def _safe_remove(path: str) -> None:
    try:
        os.remove(path)
    except OSError:
        pass
