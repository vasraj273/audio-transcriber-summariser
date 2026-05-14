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
