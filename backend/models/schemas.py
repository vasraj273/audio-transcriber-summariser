from pydantic import BaseModel
from typing import List, Literal


class ProcessResponse(BaseModel):
    transcript: str
    summary: str
    key_points: List[str]
    detected_language: str


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
