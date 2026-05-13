from pydantic import BaseModel
from typing import List


class ProcessResponse(BaseModel):
    transcript: str
    summary: str
    key_points: List[str]
