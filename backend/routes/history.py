import json
import base64
from fastapi import APIRouter, Header, HTTPException
from typing import Optional
from services.supabase_service import get_history

router = APIRouter()


@router.get("/history")
def fetch_history(authorization: Optional[str] = Header(None)):
    user_id = _extract_user_id(authorization)
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    return get_history(user_id)


def _extract_user_id(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ")[1]
    try:
        padding = 4 - len(token.split(".")[1]) % 4
        payload_bytes = base64.b64decode(token.split(".")[1] + "=" * padding)
        return json.loads(payload_bytes).get("sub")
    except Exception:
        return None
