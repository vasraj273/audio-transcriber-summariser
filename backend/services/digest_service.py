"""Daily Intelligence orchestrator.

Builds the user-facing daily digest by combining numbers from
`productivity_service`, themes from `topic_analysis_service`, and pending
tasks/deadlines from `actions_service`. Renders an HTML-safe Telegram body
plus a structured metadata dict that gets cached in `daily_digest`.

Cron at /cron/digest calls `build_today_digest` -> `save_digest` ->
`telegram_service.send_message`. The /digest text command reuses the cached
row if one exists for today; otherwise it falls through to a live build so
manual invocations still work before the cron has run.

Fail-soft throughout: any single piece (tasks read, theme read, productivity,
cache write, etc.) can fail and the digest still ships with the rest.
"""

from __future__ import annotations

import logging
from collections import Counter
from datetime import date, datetime, time as time_cls, timezone
from typing import Any, Optional

try:
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError  # type: ignore
except ImportError:  # pragma: no cover — Python 3.11 guaranteed
    ZoneInfo = None  # type: ignore
    ZoneInfoNotFoundError = Exception  # type: ignore

from services import actions_service, productivity_service, topic_analysis_service
from services.supabase_service import _client  # type: ignore[attr-defined]

logger = logging.getLogger(__name__)

# Soft cap so a digest never gets close to Telegram's 4096-char ceiling.
_TELEGRAM_SAFE_CHARS = 3900


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _resolve_tz(tz_name: str | None) -> Any:
    """Return a tzinfo for `tz_name`, falling back to UTC on any error."""
    if not tz_name:
        return timezone.utc
    if ZoneInfo is None:
        return timezone.utc
    try:
        return ZoneInfo(tz_name)
    except Exception:
        return timezone.utc


def _html_escape(text: str) -> str:
    return (
        (text or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _truncate(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "…"


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def build_today_digest(user_id: str, chat_id: int, tz_name: str = "UTC") -> dict[str, Any]:
    """Build today's digest for a user in their local timezone.

    Returns:
        {
            "summary_text": "<HTML-safe Telegram body>",
            "metadata": {... structured numbers ...},
        }
    """
    tzinfo = _resolve_tz(tz_name)
    now_local = datetime.now(tzinfo)
    today_local: date = now_local.date()
    day_start_local = datetime.combine(today_local, time_cls.min, tzinfo=tzinfo)
    day_end_local = now_local  # midnight-to-now in the user's TZ

    # Convert to UTC for the DB which stores TIMESTAMPTZ.
    day_start_utc = day_start_local.astimezone(timezone.utc)
    day_end_utc = day_end_local.astimezone(timezone.utc)

    # 1. Today's recordings -------------------------------------------------
    recordings: list[dict] = []
    try:
        recordings = (
            _client.table("transcripts")
            .select("id, audio_name, detected_language, duration_seconds, created_at, status")
            .eq("user_id", user_id)
            .eq("status", "completed")
            .gte("created_at", day_start_utc.isoformat())
            .lte("created_at", day_end_utc.isoformat())
            .order("created_at", desc=False)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        logger.warning("[Digest] transcripts read failed: %s", exc)

    total_seconds = sum(float(r.get("duration_seconds") or 0) for r in recordings)

    languages_counter: Counter[str] = Counter()
    for r in recordings:
        lang = (r.get("detected_language") or "").strip()
        if lang:
            languages_counter[lang] += 1
    languages = [
        {"language": lang, "count": count}
        for lang, count in languages_counter.most_common(5)
    ]

    # 2. Pending tasks ------------------------------------------------------
    pending_tasks_raw: list[dict] = []
    try:
        pending_tasks_raw = actions_service.list_action_items(user_id, status="pending", limit=20)
    except Exception as exc:
        logger.warning("[Digest] pending tasks read failed: %s", exc)

    def _priority_rank(row: dict) -> int:
        return 0 if (row.get("priority") or "").lower() == "urgent" else 1

    sorted_pending = sorted(
        pending_tasks_raw,
        key=lambda r: (_priority_rank(r), -_created_at_epoch(r)),
    )
    pending_top = sorted_pending[:5]

    # 3. Deadlines (any pending task with a due_date >= today) -------------
    today_iso = today_local.isoformat()
    deadlines = [
        r
        for r in sorted_pending
        if r.get("due_date") and str(r.get("due_date")) >= today_iso
    ][:5]

    # 4. Recurring themes + people ----------------------------------------
    try:
        topics = topic_analysis_service.recurring_themes(user_id) or []
    except Exception as exc:
        logger.warning("[Digest] recurring_themes failed: %s", exc)
        topics = []
    topics_top = topics[:3]

    try:
        people = topic_analysis_service.latest_people(user_id, limit=10) or []
    except Exception as exc:
        logger.warning("[Digest] latest_people failed: %s", exc)
        people = []
    people_top = people[:3]

    # 5. Productivity ------------------------------------------------------
    try:
        productivity = productivity_service.compute_score(
            user_id, day_start_utc, day_end_utc
        )
    except Exception as exc:
        logger.warning("[Digest] compute_score failed: %s", exc)
        productivity = {
            "recordings": len(recordings),
            "total_seconds": total_seconds,
            "tasks_total": 0,
            "tasks_done": 0,
            "tasks_pending": 0,
            "tasks_dismissed": 0,
            "completion_pct": 0,
            "score": 0,
        }

    metadata = {
        "date": today_local.isoformat(),
        "recordings": len(recordings),
        "total_seconds": total_seconds,
        "topics": topics_top,
        "people": people_top,
        "pending_tasks": [_strip_task(t) for t in pending_top],
        "deadlines": [_strip_task(t) for t in deadlines],
        "languages": languages,
        "productivity": productivity,
    }

    summary_text = _render_digest_html(
        today_local=today_local,
        recordings=recordings,
        languages=languages,
        topics=topics_top,
        people=people_top,
        pending_top=pending_top,
        deadlines=deadlines,
        productivity=productivity,
    )

    return {"summary_text": summary_text, "metadata": metadata}


def _created_at_epoch(row: dict) -> float:
    created = row.get("created_at")
    if not created:
        return 0.0
    try:
        return datetime.fromisoformat(str(created).replace("Z", "+00:00")).timestamp()
    except Exception:
        return 0.0


def _strip_task(row: dict) -> dict:
    """Trim an action_items row to just the fields we store in the digest cache."""
    return {
        "id": str(row.get("id") or ""),
        "title": (row.get("title") or "").strip(),
        "person": (row.get("person") or "").strip(),
        "due_date": str(row.get("due_date") or "") or None,
        "due_time": str(row.get("due_time") or "") or None,
        "priority": (row.get("priority") or "normal").lower(),
    }


# ---------------------------------------------------------------------------
# Render (HTML, Telegram parse_mode=HTML)
# ---------------------------------------------------------------------------

def _render_digest_html(
    *,
    today_local: date,
    recordings: list[dict],
    languages: list[dict],
    topics: list[dict],
    people: list[dict],
    pending_top: list[dict],
    deadlines: list[dict],
    productivity: dict,
) -> str:
    """Render the HTML body. Caller is responsible for sending with parse_mode=HTML."""
    lines: list[str] = []
    lines.append(f"🧭 <b>Daily Digest — {today_local.isoformat()}</b>")
    lines.append("")

    # Recordings
    if recordings:
        total_str = productivity_service.format_duration(productivity.get("total_seconds") or 0)
        lines.append(
            f"🎙 <b>Today's recordings:</b> {len(recordings)} • {_html_escape(total_str)}"
        )
        for r in recordings[:5]:
            name = _html_escape((r.get("audio_name") or "audio").replace("telegram:", ""))
            dur = productivity_service.format_duration(r.get("duration_seconds") or 0)
            lines.append(f"  • {_truncate(name, 60)} <i>({_html_escape(dur)})</i>")
        if len(recordings) > 5:
            lines.append(f"  • <i>…and {len(recordings) - 5} more</i>")
        lines.append("")
    else:
        lines.append("🎙 <b>Today's recordings:</b> none")
        lines.append("")

    # Productivity
    score = int(productivity.get("score") or 0)
    completion = int(productivity.get("completion_pct") or 0)
    lines.append(
        f"📊 <b>Productivity:</b> {score}/100 — "
        f"{productivity.get('tasks_done', 0)} done, "
        f"{productivity.get('tasks_pending', 0)} pending "
        f"({completion}% completion)"
    )
    lines.append("")

    # Pending tasks (top 5)
    if pending_top:
        lines.append("📋 <b>Pending tasks:</b>")
        for t in pending_top:
            title = _html_escape((t.get("title") or "(untitled)").strip())
            extras: list[str] = []
            person = (t.get("person") or "").strip()
            if person:
                extras.append(_html_escape(person))
            due_date = (t.get("due_date") or "")
            due_time = (t.get("due_time") or "")
            if due_date and due_time:
                extras.append(_html_escape(f"{due_date} {due_time}"))
            elif due_date:
                extras.append(_html_escape(str(due_date)))
            suffix = f" <i>({', '.join(extras)})</i>" if extras else ""
            prefix = "🔴 " if (t.get("priority") or "").lower() == "urgent" else ""
            lines.append(f"  • {prefix}{_truncate(title, 80)}{suffix}")
        lines.append("")

    # Deadlines (upcoming)
    if deadlines:
        lines.append("⏰ <b>Upcoming deadlines:</b>")
        for t in deadlines:
            title = _html_escape((t.get("title") or "(untitled)").strip())
            when_parts: list[str] = []
            if t.get("due_date"):
                when_parts.append(str(t.get("due_date")))
            if t.get("due_time"):
                when_parts.append(str(t.get("due_time")))
            when = " ".join(when_parts)
            suffix = f" <i>({_html_escape(when)})</i>" if when else ""
            lines.append(f"  • {_truncate(title, 80)}{suffix}")
        lines.append("")

    # Topics
    if topics:
        topic_strs = [
            f"{_html_escape(str(t.get('label') or ''))} ({int(t.get('mentions') or 0)})"
            for t in topics
        ]
        lines.append("🔁 <b>Recurring themes:</b> " + ", ".join(topic_strs))
        lines.append("")

    # People
    if people:
        people_strs = [
            f"{_html_escape(str(p.get('name') or ''))} ({int(p.get('mentions') or 0)})"
            for p in people
        ]
        lines.append("👥 <b>Top people:</b> " + ", ".join(people_strs))
        lines.append("")

    # Languages
    if languages:
        lang_strs = [
            f"{_html_escape(str(l.get('language') or ''))} ({int(l.get('count') or 0)})"
            for l in languages
        ]
        lines.append("🌐 <b>Languages today:</b> " + ", ".join(lang_strs))
        lines.append("")

    text = "\n".join(lines).rstrip()
    return _truncate(text, _TELEGRAM_SAFE_CHARS)


# ---------------------------------------------------------------------------
# Cache (daily_digest table)
# ---------------------------------------------------------------------------

def save_digest(
    user_id: str,
    digest_date: date,
    summary_text: str,
    metadata: dict,
) -> None:
    """Upsert today's digest keyed by (user_id, digest_date). Fail-soft."""
    if not user_id or not digest_date:
        return
    payload = {
        "user_id": user_id,
        "digest_date": digest_date.isoformat(),
        "summary": summary_text or "",
        "metadata": metadata or {},
    }
    try:
        _client.table("daily_digest").upsert(payload, on_conflict="user_id,digest_date").execute()
    except Exception as exc:
        logger.warning("[Digest] save_digest upsert failed: %s", exc)


def get_cached_digest(user_id: str, digest_date: date) -> Optional[dict]:
    """Read today's cached digest if it exists. Fail-soft to None."""
    if not user_id or not digest_date:
        return None
    try:
        rows = (
            _client.table("daily_digest")
            .select("summary, metadata, digest_date, created_at")
            .eq("user_id", user_id)
            .eq("digest_date", digest_date.isoformat())
            .limit(1)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        logger.warning("[Digest] get_cached_digest read failed: %s", exc)
        return None
    if not rows:
        return None
    row = rows[0]
    return {
        "summary_text": row.get("summary") or "",
        "metadata": row.get("metadata") or {},
        "digest_date": row.get("digest_date"),
        "created_at": row.get("created_at"),
    }


# ---------------------------------------------------------------------------
# Scheduling
# ---------------------------------------------------------------------------

def should_send_now(prefs_row: dict, now_utc: datetime) -> bool:
    """True when, in the user's TZ, the current hour matches `digest_hour`
    AND we haven't already sent a digest today (per user's local date)."""
    if not prefs_row or not prefs_row.get("digest_enabled", True):
        return False

    tzinfo = _resolve_tz(prefs_row.get("timezone") or "UTC")
    now_local = now_utc.astimezone(tzinfo)
    target_hour = int(prefs_row.get("digest_hour") or 20)

    if now_local.hour != target_hour:
        return False

    last_sent = prefs_row.get("last_digest_sent_at")
    if not last_sent:
        return True

    try:
        last_dt = datetime.fromisoformat(str(last_sent).replace("Z", "+00:00"))
    except Exception:
        return True

    if last_dt.tzinfo is None:
        last_dt = last_dt.replace(tzinfo=timezone.utc)

    last_local_date = last_dt.astimezone(tzinfo).date()
    return last_local_date != now_local.date()


# ---------------------------------------------------------------------------
# telegram_chat_prefs helpers
# ---------------------------------------------------------------------------

_prefs_table_warned = False


def _warn_prefs_missing(exc: Exception) -> None:
    global _prefs_table_warned
    if _prefs_table_warned:
        return
    _prefs_table_warned = True
    logger.warning(
        "[Digest] telegram_chat_prefs unavailable (%s) — run docs/supabase_v4_intelligence_migration.sql",
        exc,
    )


def upsert_chat_prefs(chat_id: int, user_id: str) -> Optional[dict]:
    """Insert a default prefs row for a chat on first contact. Best-effort:
    silent on duplicate; logs once on table-missing."""
    try:
        existing = (
            _client.table("telegram_chat_prefs")
            .select("*")
            .eq("chat_id", chat_id)
            .limit(1)
            .execute()
        )
        if existing.data:
            return existing.data[0]
        payload = {
            "chat_id": chat_id,
            "user_id": user_id,
            "timezone": "UTC",
            "digest_enabled": True,
            "digest_hour": 20,
        }
        inserted = _client.table("telegram_chat_prefs").insert(payload).execute()
        return (inserted.data or [None])[0]
    except Exception as exc:
        _warn_prefs_missing(exc)
        return None


def get_chat_prefs(chat_id: int) -> Optional[dict]:
    try:
        resp = (
            _client.table("telegram_chat_prefs")
            .select("*")
            .eq("chat_id", chat_id)
            .limit(1)
            .execute()
        )
        return (resp.data or [None])[0]
    except Exception as exc:
        _warn_prefs_missing(exc)
        return None


def set_timezone(chat_id: int, tz_name: str) -> bool:
    if ZoneInfo is None:
        return False
    try:
        ZoneInfo(tz_name)
    except Exception:
        return False
    try:
        _client.table("telegram_chat_prefs").update(
            {"timezone": tz_name, "updated_at": datetime.now(timezone.utc).isoformat()}
        ).eq("chat_id", chat_id).execute()
        return True
    except Exception as exc:
        _warn_prefs_missing(exc)
        return False


def set_digest_enabled(chat_id: int, enabled: bool) -> bool:
    try:
        _client.table("telegram_chat_prefs").update(
            {"digest_enabled": enabled, "updated_at": datetime.now(timezone.utc).isoformat()}
        ).eq("chat_id", chat_id).execute()
        return True
    except Exception as exc:
        _warn_prefs_missing(exc)
        return False


def mark_digest_sent(chat_id: int, when: Optional[datetime] = None) -> None:
    when = when or datetime.now(timezone.utc)
    try:
        _client.table("telegram_chat_prefs").update(
            {"last_digest_sent_at": when.isoformat()}
        ).eq("chat_id", chat_id).execute()
    except Exception as exc:
        _warn_prefs_missing(exc)


def list_enabled_prefs() -> list[dict]:
    """All chats with digest enabled. Cron iterates this."""
    try:
        resp = (
            _client.table("telegram_chat_prefs")
            .select("*")
            .eq("digest_enabled", True)
            .execute()
        )
        return resp.data or []
    except Exception as exc:
        _warn_prefs_missing(exc)
        return []
