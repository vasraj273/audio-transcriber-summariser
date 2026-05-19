"""Productivity scoring helpers for the V4 Daily Intelligence layer.

Pure helpers, no LLM. Reads from `transcripts` and `action_items` and
returns a small numeric snapshot for use by the digest formatter and the
/stats Telegram command.

Fail-soft: every DB error returns the safe-zero shape so the digest still
sends something useful when a table is missing or RLS is misconfigured.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from services.supabase_service import _client  # type: ignore[attr-defined]

logger = logging.getLogger(__name__)


_NON_WORK_AUDIO_TYPES = {"music_song", "empty_audio"}


def _zero_score() -> dict[str, Any]:
    return {
        "recordings": 0,
        "work_recordings": 0,
        "total_seconds": 0.0,
        "tasks_total": 0,
        "tasks_done": 0,
        "tasks_pending": 0,
        "tasks_dismissed": 0,
        "completion_pct": None,
        "score": None,
        "insufficient_data": True,
    }


def compute_score(user_id: str, since: datetime, until: datetime) -> dict[str, Any]:
    """Aggregate transcripts + action_items into a small productivity snapshot.

    Returns the zero-shape on any DB error so the caller can render a digest
    even before the new migration has been applied.
    """
    if not user_id:
        return _zero_score()

    since_iso = since.isoformat()
    until_iso = until.isoformat()

    recordings = 0
    work_recordings = 0
    total_seconds = 0.0
    try:
        rows = (
            _client.table("transcripts")
            .select("id, duration_seconds, status, created_at, audio_type")
            .eq("user_id", user_id)
            .eq("status", "completed")
            .gte("created_at", since_iso)
            .lte("created_at", until_iso)
            .execute()
            .data
            or []
        )
        recordings = len(rows)
        total_seconds = sum(float(r.get("duration_seconds") or 0) for r in rows)
        work_recordings = sum(
            1 for r in rows
            if (r.get("audio_type") or "").lower() not in _NON_WORK_AUDIO_TYPES
        )
    except Exception as exc:
        logger.warning("[Productivity] transcripts read failed: %s", exc)

    tasks_done = 0
    tasks_pending = 0
    tasks_dismissed = 0
    try:
        rows = (
            _client.table("action_items")
            .select("id, status")
            .eq("user_id", user_id)
            .execute()
            .data
            or []
        )
        for r in rows:
            status = (r.get("status") or "").lower()
            if status == "done":
                tasks_done += 1
            elif status == "pending":
                tasks_pending += 1
            elif status == "dismissed":
                tasks_dismissed += 1
    except Exception as exc:
        logger.warning("[Productivity] action_items read failed: %s", exc)

    tasks_total = tasks_done + tasks_pending + tasks_dismissed
    insufficient_data = tasks_total == 0 and work_recordings == 0

    if insufficient_data:
        completion_pct: Any = None
        score: Any = None
    else:
        denom = tasks_done + tasks_pending
        completion_pct = round(100 * tasks_done / max(1, denom)) if denom > 0 else None
        if completion_pct is None:
            # Have work recordings but no actionable tasks yet — score from activity only.
            score = round(min(100, work_recordings * 12))
        else:
            score = round(0.6 * completion_pct + 0.4 * min(100, work_recordings * 12))

    return {
        "recordings": recordings,
        "work_recordings": work_recordings,
        "total_seconds": float(total_seconds),
        "tasks_total": tasks_total,
        "tasks_done": tasks_done,
        "tasks_pending": tasks_pending,
        "tasks_dismissed": tasks_dismissed,
        "completion_pct": completion_pct,
        "score": score,
        "insufficient_data": insufficient_data,
    }


def format_duration(seconds: float) -> str:
    """Render seconds as `2h 14m` / `42m` / `18s`."""
    try:
        s = int(float(seconds or 0))
    except (TypeError, ValueError):
        s = 0
    if s <= 0:
        return "0s"
    hours, rem = divmod(s, 3600)
    minutes, secs = divmod(rem, 60)
    if hours:
        return f"{hours}h {minutes}m"
    if minutes:
        return f"{minutes}m"
    return f"{secs}s"
