import os
import tempfile
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from models.schemas import ProcessResponse
from services.groq_service import (
    assess_transcription_quality,
    infer_speakers,
    summarise_transcript,
    transcribe_audio,
)

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
    transcription = transcribe_audio(file_path)
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
        }

    summary_result = summarise_transcript(
        transcript=transcription["text"],
        output_language=options.get("output_language", "English"),
        focus=options.get("summary_focus", "General Summary"),
        format=options.get("summary_format", "Bullet Points"),
        length=options.get("summary_length", "Medium"),
        custom_focus=options.get("custom_focus", ""),
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
        "warning": quality["warning"],
        "duration_seconds": transcription.get("duration", 0),
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
