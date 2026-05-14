import os
import tempfile
import uuid
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from models.schemas import JobCreateResponse, JobStatusResponse
from routes.process import process_audio_file
from services.supabase_service import (
    complete_transcript,
    create_processing_transcript,
    fail_transcript,
    get_transcript_by_job,
    mark_transcript_processing,
)

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

    JOBS[job_id] = {
        "job_id": job_id,
        "record_id": record_id,
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
    try:
        JOBS[job_id]["status"] = "processing"
        mark_transcript_processing(job_id)
        result = process_audio_file(tmp_path, options)
        complete_transcript(job_id, result)
        JOBS[job_id] = {**JOBS[job_id], **result, "status": "completed"}
    except Exception as exc:
        message = str(exc) or "Processing failed."
        JOBS[job_id] = {**JOBS.get(job_id, {"job_id": job_id}), "status": "failed", "error_message": message}
        fail_transcript(job_id, message)
    finally:
        _safe_remove(tmp_path)


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
