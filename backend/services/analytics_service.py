"""Analytics + API monitoring persistence.

Every successful (or failed) transcript writes one row into `analytics_events`.
Every outbound AI call writes one row into `api_usage_events`. The admin
Analytics + API Monitoring panels read from these tables.

Writes use the service-role client when available so RLS cannot silently
swallow them. Insert failures are logged loudly with the underlying
PostgREST error - we do NOT swallow them quietly because the whole point of
this module is observability.
"""

import logging
import os
from datetime import datetime, timezone
from typing import Optional

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

logger = logging.getLogger(__name__)

_SUPABASE_URL = os.getenv("SUPABASE_URL")
_SUPABASE_KEY = os.getenv("SUPABASE_KEY")
_SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not _SUPABASE_URL or not _SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set for analytics_service.")

# Prefer service-role so analytics inserts never hit RLS. Fall back to the
# anon key only if the service-role env var has not been added yet.
if _SUPABASE_SERVICE_ROLE_KEY:
    _client: Client = create_client(_SUPABASE_URL, _SUPABASE_SERVICE_ROLE_KEY)
    logger.info("[Analytics] analytics_service using service-role key.")
else:
    _client = create_client(_SUPABASE_URL, _SUPABASE_KEY)
    logger.warning(
        "[Analytics] SUPABASE_SERVICE_ROLE_KEY not set - analytics writes will use anon key. "
        "If RLS is enabled on analytics_events/api_usage_events this WILL fail."
    )


# ---------------------------------------------------------------------------
# Transcript-level analytics
# ---------------------------------------------------------------------------

def record_transcript_event(
    *,
    transcript_id: Optional[str],
    job_id: Optional[str],
    user_id: Optional[str],
    duration_seconds: float = 0.0,
    language: Optional[str] = None,
    audio_type: Optional[str] = None,
    provider_used: Optional[str] = None,
    credits_used: int = 0,
    processing_ms: Optional[int] = None,
    transcript_status: str = "completed",
    error_message: Optional[str] = None,
) -> dict:
    """Insert one analytics_events row. Returns the inserted row.

    Raises on insert failure - callers in `routes/jobs.py` translate that into
    a backend log so the operator sees exactly why analytics is empty.
    """
    print(
        f"[Analytics] begin tracking job_id={job_id} transcript_id={transcript_id} "
        f"provider={provider_used} status={transcript_status} duration={duration_seconds}s"
    )

    payload = {
        "transcript_id": transcript_id,
        "job_id": job_id,
        "user_id": user_id,
        "duration_seconds": float(duration_seconds or 0),
        "language": language or "unknown",
        "audio_type": audio_type or "unknown",
        "provider_used": provider_used or "unknown",
        "credits_used": int(credits_used or 0),
        "processing_ms": processing_ms,
        "transcript_status": transcript_status,
        "error_message": (error_message or "")[:1000] or None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        response = _client.table("analytics_events").insert(payload).execute()
    except Exception as exc:
        print(f"[Analytics] insert failed payload={payload} error={exc}")
        logger.exception("[Analytics] analytics_events insert failed.")
        raise

    rows = response.data or []
    inserted = rows[0] if rows else {}
    total = _count_rows("analytics_events")
    print(
        f"[Analytics] inserted id={inserted.get('id')} job_id={job_id} "
        f"total_rows_now={total}"
    )
    return inserted


# ---------------------------------------------------------------------------
# API call monitoring
# ---------------------------------------------------------------------------

def record_api_call(
    *,
    provider: str,
    endpoint: str = "",
    success: bool = True,
    rate_limited: bool = False,
    duration_seconds: float = 0.0,
    latency_ms: Optional[int] = None,
    error_message: Optional[str] = None,
) -> None:
    """Insert one api_usage_events row. Never raises - monitoring should not
    take down the request path - but logs loudly on failure."""

    payload = {
        "provider": provider,
        "endpoint": endpoint or None,
        "success": bool(success),
        "rate_limited": bool(rate_limited),
        "duration_seconds": float(duration_seconds or 0),
        "latency_ms": latency_ms,
        "error_message": (error_message or "")[:1000] or None,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        _client.table("api_usage_events").insert(payload).execute()
    except Exception as exc:
        print(
            f"[Monitoring] insert failed provider={provider} endpoint={endpoint} "
            f"success={success} rate_limited={rate_limited} error={exc}"
        )
        logger.exception("[Monitoring] api_usage_events insert failed.")
        return

    print(
        f"[Monitoring] updated provider={provider} endpoint={endpoint} "
        f"success={success} rate_limited={rate_limited} latency_ms={latency_ms}"
    )


# ---------------------------------------------------------------------------
# Backfill
# ---------------------------------------------------------------------------

def backfill_from_transcripts(force: bool = False) -> dict:
    """Copy every transcripts row into analytics_events if the table is empty.

    Returns a dict with `existing`, `inserted`, `skipped`. Pass force=True to
    re-import all transcripts even when analytics_events already has rows
    (rows are de-duplicated on transcript_id).
    """

    existing = _count_rows("analytics_events")
    print(f"[Analytics] backfill check: analytics_events has {existing} rows (force={force})")

    if existing > 0 and not force:
        print("[Analytics] backfill skipped: analytics_events already populated.")
        return {"existing": existing, "inserted": 0, "skipped": True}

    try:
        transcripts = (
            _client.table("transcripts")
            .select(
                "id, job_id, user_id, created_at, duration_seconds, detected_language, "
                "audio_type, transcription_provider, credits_used, processing_ms, status, error_message"
            )
            .execute()
            .data
            or []
        )
    except Exception as exc:
        print(f"[Analytics] backfill failed reading transcripts: {exc}")
        logger.exception("[Analytics] backfill transcripts read failed.")
        raise

    print(f"[Analytics] backfill source: {len(transcripts)} transcript rows.")

    if not transcripts:
        return {"existing": existing, "inserted": 0, "skipped": False}

    # Pull existing transcript_ids so we don't duplicate.
    seen = set()
    try:
        existing_rows = (
            _client.table("analytics_events").select("transcript_id").execute().data or []
        )
        seen = {row.get("transcript_id") for row in existing_rows if row.get("transcript_id")}
    except Exception as exc:
        print(f"[Analytics] backfill could not read existing transcript_ids: {exc}")

    payloads = []
    for record in transcripts:
        tid = record.get("id")
        if not tid or tid in seen:
            continue
        payloads.append({
            "transcript_id": tid,
            "job_id": record.get("job_id"),
            "user_id": record.get("user_id"),
            "duration_seconds": float(record.get("duration_seconds") or 0),
            "language": record.get("detected_language") or "unknown",
            "audio_type": record.get("audio_type") or "unknown",
            "provider_used": record.get("transcription_provider") or "unknown",
            "credits_used": int(record.get("credits_used") or 0),
            "processing_ms": record.get("processing_ms"),
            "transcript_status": record.get("status") or "completed",
            "error_message": (record.get("error_message") or "")[:1000] or None,
            "created_at": record.get("created_at"),
        })

    if not payloads:
        print("[Analytics] backfill: no new transcripts to import.")
        return {"existing": existing, "inserted": 0, "skipped": False}

    inserted_total = 0
    for chunk in _chunks(payloads, 200):
        try:
            response = _client.table("analytics_events").insert(chunk).execute()
            inserted_total += len(response.data or [])
        except Exception as exc:
            print(f"[Analytics] backfill chunk insert failed (size={len(chunk)}): {exc}")
            logger.exception("[Analytics] backfill chunk insert failed.")
            raise

    final_count = _count_rows("analytics_events")
    print(
        f"[Analytics] backfill complete inserted={inserted_total} total_rows_now={final_count}"
    )
    return {"existing": existing, "inserted": inserted_total, "skipped": False, "total": final_count}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _count_rows(table: str) -> int:
    try:
        response = _client.table(table).select("id", count="exact").limit(1).execute()
        return getattr(response, "count", None) or 0
    except Exception as exc:
        logger.warning("[Analytics] row-count failed for %s: %s", table, exc)
        return -1


def _chunks(items: list, size: int):
    for index in range(0, len(items), size):
        yield items[index:index + size]
