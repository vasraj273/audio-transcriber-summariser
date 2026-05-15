from pydantic import BaseModel
from typing import List, Literal


class TranscriptSegment(BaseModel):
    start: float
    end: float
    text: str
    speaker: str = ""


class ProcessResponse(BaseModel):
    transcript: str
    summary: str
    key_points: List[str]
    detected_language: str
    transcript_segments: List[TranscriptSegment] = []
    speaker_transcript: str = ""
    speaker_count: int = 1
    audio_type: str = "speech"
    quality_score: float = 1.0
    quality_flags: List[str] = []
    warning: str = ""
    duration_seconds: float = 0.0


class JobCreateResponse(BaseModel):
    job_id: str
    record_id: str = ""
    status: str


class JobStatusResponse(BaseModel):
    job_id: str
    record_id: str = ""
    status: str
    audio_name: str = ""
    transcript: str = ""
    summary: str = ""
    key_points: List[str] = []
    detected_language: str = ""
    transcript_segments: List[TranscriptSegment] = []
    speaker_transcript: str = ""
    speaker_count: int = 1
    audio_type: str = ""
    quality_score: float = 0.0
    quality_flags: List[str] = []
    error_message: str = ""
    warning: str = ""
    duration_seconds: float = 0.0


class TranscriptAnalysisRequest(BaseModel):
    records: List[dict]


class TranscriptAnalysisResponse(BaseModel):
    result: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    transcript: str
    summary: str
    messages: List[ChatMessage] = []
    question: str


class ChatResponse(BaseModel):
    answer: str


class AdminCheckResponse(BaseModel):
    is_admin: bool
    user_id: str


class AdminCreditsAdjustment(BaseModel):
    mode: str  # "add" | "reset" | "set_total"
    amount: int = 0


class AdminSettingUpdate(BaseModel):
    value: dict | list | int | float | bool | str | None
