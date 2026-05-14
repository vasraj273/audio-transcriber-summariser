from fastapi import APIRouter, HTTPException
from models.schemas import TranscriptAnalysisRequest, TranscriptAnalysisResponse
from services.groq_service import compare_transcripts, merge_transcripts

router = APIRouter(prefix="/analysis")


@router.post("/compare", response_model=TranscriptAnalysisResponse)
def compare(payload: TranscriptAnalysisRequest):
    _validate_records(payload.records)
    return TranscriptAnalysisResponse(result=compare_transcripts(payload.records))


@router.post("/merge", response_model=TranscriptAnalysisResponse)
def merge(payload: TranscriptAnalysisRequest):
    _validate_records(payload.records)
    return TranscriptAnalysisResponse(result=merge_transcripts(payload.records))


def _validate_records(records: list) -> None:
    if len(records) < 2:
        raise HTTPException(status_code=400, detail="Select at least two transcripts.")
    if len(records) > 6:
        raise HTTPException(status_code=400, detail="Please compare or merge up to 6 transcripts at a time.")
