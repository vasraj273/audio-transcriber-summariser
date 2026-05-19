"""HTTP cron endpoints.

Designed to be hit by an external scheduler (e.g. cron-job.org) every 15 min.
Each invocation iterates all telegram_chat_prefs rows with digest_enabled=true
and sends the digest to chats whose local hour matches their digest_hour AND
who haven't received today's digest yet.

Idempotent within a user's local day — `should_send_now` guards on
`last_digest_sent_at`.
"""

from __future__ import annotations

import logging
import os
from datetime import date, datetime, timezone

from fastapi import APIRouter, Header, HTTPException, status

from services import digest_service, telegram_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/cron", tags=["cron"])


@router.post("/digest")
async def run_daily_digest_cron(
    x_cron_secret: str | None = Header(default=None, alias="X-Cron-Secret"),
) -> dict:
    secret = os.getenv("CRON_SECRET")
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CRON_SECRET not configured.",
        )
    if not x_cron_secret or x_cron_secret != secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid cron secret.",
        )

    now_utc = datetime.now(timezone.utc)
    prefs_rows = digest_service.list_enabled_prefs()

    sent = 0
    skipped = 0
    errors = 0

    for prefs in prefs_rows:
        chat_id = prefs.get("chat_id")
        user_id = prefs.get("user_id")
        tz_name = prefs.get("timezone") or "UTC"

        if chat_id is None or not user_id:
            skipped += 1
            continue

        try:
            if not digest_service.should_send_now(prefs, now_utc):
                skipped += 1
                continue

            digest = digest_service.build_today_digest(
                user_id=str(user_id),
                chat_id=int(chat_id),
                tz_name=tz_name,
            )
            summary_text = digest.get("summary_text") or ""
            metadata = digest.get("metadata") or {}
            digest_date_str = metadata.get("date") or date.today().isoformat()

            try:
                digest_date = date.fromisoformat(digest_date_str)
            except Exception:
                digest_date = date.today()

            digest_service.save_digest(
                user_id=str(user_id),
                digest_date=digest_date,
                summary_text=summary_text,
                metadata=metadata,
            )

            if summary_text.strip():
                await telegram_service.send_message(int(chat_id), summary_text)

            digest_service.mark_digest_sent(int(chat_id), now_utc)
            sent += 1
        except Exception:
            errors += 1
            logger.exception("[Cron] digest failed for chat_id=%s", chat_id)
            continue

    return {"ok": True, "sent": sent, "skipped": skipped, "errors": errors}
