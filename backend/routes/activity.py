"""Lightweight ping endpoint that stamps the caller's last-active time.

Frontend hits this on session restore / login / other meaningful UI events so
the admin Users page can show fresh "Last active" values. The actual write is
throttled inside `services.supabase_service.touch_user_active` so frequent
pings collapse to at most one DB write per 15 minutes per user.
"""

from fastapi import APIRouter
from pydantic import BaseModel

from services.supabase_service import touch_user_active

router = APIRouter()


class TouchActivePayload(BaseModel):
    user_id: str


@router.post("/activity/touch")
def touch_active(payload: TouchActivePayload) -> dict:
    touch_user_active(payload.user_id)
    return {"ok": True}
