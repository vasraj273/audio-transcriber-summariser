import os
import tempfile
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from models.schemas import ProcessResponse
from services.groq_service import transcribe_audio, summarise_transcript, infer_speakers

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
        transcription = transcribe_audio(tmp_path)
        result = summarise_transcript(
            transcript=transcription["text"],
            output_language=output_language,
            focus=summary_focus,
            format=summary_format,
            length=summary_length,
            custom_focus=custom_focus,
        )
        try:
            speaker_result = infer_speakers(transcription["text"], transcription["segments"])
        except Exception:
            speaker_result = {
                "speaker_transcript": transcription["text"],
                "speaker_count": 1,
                "segments": [
                    {**segment, "speaker": "Speaker 1"}
                    for segment in transcription["segments"]
                ],
            }
    finally:
        os.remove(tmp_path)

    return ProcessResponse(
        transcript=transcription["text"],
        summary=result["summary"],
        key_points=result["key_points"],
        detected_language=transcription["language"],
        transcript_segments=speaker_result["segments"],
        speaker_transcript=speaker_result["speaker_transcript"],
        speaker_count=speaker_result["speaker_count"],
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
