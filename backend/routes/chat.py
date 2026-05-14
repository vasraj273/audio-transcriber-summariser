from fastapi import APIRouter, HTTPException
from models.schemas import ChatRequest, ChatResponse
from services.groq_service import chat_with_audio

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
async def chat(payload: ChatRequest):
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    if not payload.transcript.strip():
        raise HTTPException(status_code=400, detail="Transcript is required for chat.")

    answer = chat_with_audio(
        transcript=payload.transcript,
        summary=payload.summary,
        history=payload.messages,
        question=payload.question,
    )
    return ChatResponse(answer=answer)
