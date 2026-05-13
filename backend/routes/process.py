import os
import tempfile
from fastapi import APIRouter, UploadFile, File, HTTPException
from models.schemas import ProcessResponse
from services.groq_service import transcribe_audio, summarise_transcript

router = APIRouter()

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a"}
MAX_FILE_SIZE_MB = 25


@router.post("/process", response_model=ProcessResponse)
async def process_audio(file: UploadFile = File(...)):
    _validate_file(file)
    tmp_path = await _save_temp_file(file)

    try:
        transcript = transcribe_audio(tmp_path)
        result = summarise_transcript(transcript)
    finally:
        os.remove(tmp_path)

    return ProcessResponse(
        transcript=transcript,
        summary=result["summary"],
        key_points=result["key_points"],
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
