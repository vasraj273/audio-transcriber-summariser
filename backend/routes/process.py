import os
import json
import base64
import tempfile
from fastapi import APIRouter, UploadFile, File, HTTPException, Header
from typing import Optional
from models.schemas import ProcessResponse
from services.groq_service import transcribe_audio, summarise_transcript
from services.supabase_service import save_transcript

router = APIRouter()

ALLOWED_EXTENSIONS = {".mp3", ".wav", ".m4a"}
MAX_FILE_SIZE_MB = 25


@router.post("/process", response_model=ProcessResponse)
async def process_audio(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    _validate_file(file)

    user_id = _extract_user_id(authorization)

    tmp_path = await _save_temp_file(file)

    try:
        transcript = transcribe_audio(tmp_path)
        result = summarise_transcript(transcript)
    finally:
        os.remove(tmp_path)

    if user_id:
        save_transcript(
            user_id=user_id,
            audio_name=file.filename,
            transcript=transcript,
            summary=result["summary"],
            key_points=result["key_points"],
        )

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


def _extract_user_id(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ")[1]
    try:
        # JWT is header.payload.signature — decode the payload to get the user UUID
        padding = 4 - len(token.split(".")[1]) % 4
        payload_bytes = base64.b64decode(token.split(".")[1] + "=" * padding)
        return json.loads(payload_bytes).get("sub")
    except Exception:
        return None


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
