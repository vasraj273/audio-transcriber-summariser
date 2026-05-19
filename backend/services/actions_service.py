"""AI Actions / Productivity layer.

Runs a SECOND Groq Llama pass after summarisation to extract structured tasks,
people, dates, deadlines, and events from a transcript + summary. Results are
persisted to the `action_items` Supabase table so the Telegram bot (and any
future frontend page) can list, complete, and dismiss them.

Hard rules followed here:
- We reuse `groq_service._llama_complete` so the 70B → 8B-instant fallback path
  already in place applies automatically.
- The extraction prompt forces strict JSON output. Any parse / LLM failure
  returns an empty result dict — the caller MUST still send the user their
  summary, just without the Detected / Action-Items sections.
- DB writes mirror the fail-soft pattern in `analytics_service`: when the table
  is missing or RLS blocks us, we log loudly once and return empty / False.
  This is intentional — the action_items table is brand new and may not have
  been migrated yet on the live Render instance.
"""

import json
import logging
import os
import re
from datetime import date, datetime, time as time_cls
from typing import Optional

from dotenv import load_dotenv
from supabase import Client, create_client

from services.groq_service import _llama_complete

load_dotenv()

logger = logging.getLogger(__name__)

# Prefer service-role so writes never get silently RLS-blocked, but fall back
# to the anon key in dev — same pattern as analytics_service.
_SUPABASE_URL = os.getenv("SUPABASE_URL")
_SUPABASE_KEY = os.getenv("SUPABASE_KEY")
_SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not _SUPABASE_URL or not _SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set for actions_service.")

if _SUPABASE_SERVICE_ROLE_KEY:
    _client: Client = create_client(_SUPABASE_URL, _SUPABASE_SERVICE_ROLE_KEY)
else:
    _client = create_client(_SUPABASE_URL, _SUPABASE_KEY)

# Track table-missing/RLS warnings so we log once per process.
_action_table_warned = False


def _empty_result() -> dict:
    return {"tasks": [], "people": [], "dates": [], "deadlines": [], "events": []}


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------

def extract_actions(transcript: str, summary: str, language: Optional[str] = None) -> dict:
    """Run a strict-JSON Groq Llama pass to extract structured productivity
    items from a transcript + summary. Always returns a dict with the five
    canonical keys, even on parse / LLM failure (returns empty lists).
    """
    transcript_clean = (transcript or "").strip()
    summary_clean = (summary or "").strip()
    if not transcript_clean and not summary_clean:
        return _empty_result()

    today_iso = date.today().isoformat()
    lang_hint = (language or "the source language").strip() or "the source language"

    system_prompt = (
        "You extract structured productivity data from transcripts. "
        "You MUST respond with a single valid JSON object and nothing else. "
        "No prose. No markdown. No code fences. No commentary before or after."
    )

    user_prompt = f"""Today's date is {today_iso}. The transcript is in {lang_hint}.

Read the transcript and the summary below, then extract:

- tasks: concrete to-do items. Each task has:
    "title" (short imperative phrase, required),
    "description" (one sentence of context, may be empty),
    "person" (who is responsible, "" if unknown),
    "due_date" ("YYYY-MM-DD" or null — convert relative phrases like "next Monday" using today's date),
    "due_time" ("HH:MM" 24-hour or null)
- people: distinct named people mentioned
- dates: distinct calendar dates mentioned, as "YYYY-MM-DD"
- deadlines: things with a deadline. Each has "what" (string) and "when" (human-readable string)
- events: scheduled events. Each has "title", "datetime" (ISO 8601 or null), "location" (may be "")

Rules:
- Output every string in English even when the source is in another language.
- Do not invent items that are not in the transcript. Empty arrays are fine.
- All keys must be present even if their values are empty arrays.

Transcript:
\"\"\"
{transcript_clean}
\"\"\"

Summary:
\"\"\"
{summary_clean}
\"\"\"

Respond with exactly this JSON shape and nothing else:
{{"tasks": [], "people": [], "dates": [], "deadlines": [], "events": []}}
"""

    try:
        raw = _llama_complete(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.1,
        )
    except Exception as exc:
        logger.warning("[Actions] LLM extraction failed: %s", exc)
        return _empty_result()

    parsed = _safe_parse_json(raw)
    if parsed is None:
        logger.warning("[Actions] could not parse extractor JSON: %s", (raw or "")[:200])
        return _empty_result()

    return _normalise_extraction(parsed)


def _safe_parse_json(raw: str) -> Optional[dict]:
    """Pull the first JSON object out of the model output. Llama occasionally
    wraps responses in ```json fences despite instructions, so we strip those
    and fall back to a brace-balance scan."""
    if not raw:
        return None
    text = raw.strip()

    # Strip ```json or ``` fences if present.
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

    try:
        return json.loads(text)
    except Exception:
        pass

    # Fallback: find the first balanced {...} block.
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(text)):
        ch = text[i]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except Exception:
                    return None
    return None


def _normalise_extraction(parsed: dict) -> dict:
    """Guarantee the five-key shape and coerce each item to its expected form."""
    result = _empty_result()
    if not isinstance(parsed, dict):
        return result

    # Tasks
    for item in parsed.get("tasks") or []:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        result["tasks"].append({
            "title": title[:300],
            "description": str(item.get("description") or "").strip()[:1000],
            "person": str(item.get("person") or "").strip()[:200],
            "due_date": _coerce_date(item.get("due_date")),
            "due_time": _coerce_time(item.get("due_time")),
        })

    # People
    for person in parsed.get("people") or []:
        name = str(person or "").strip()
        if name and name not in result["people"]:
            result["people"].append(name[:200])

    # Dates
    for d in parsed.get("dates") or []:
        coerced = _coerce_date(d)
        if coerced and coerced not in result["dates"]:
            result["dates"].append(coerced)

    # Deadlines
    for item in parsed.get("deadlines") or []:
        if not isinstance(item, dict):
            continue
        what = str(item.get("what") or "").strip()
        when = str(item.get("when") or "").strip()
        if what or when:
            result["deadlines"].append({"what": what[:300], "when": when[:300]})

    # Events
    for item in parsed.get("events") or []:
        if not isinstance(item, dict):
            continue
        title = str(item.get("title") or "").strip()
        if not title:
            continue
        result["events"].append({
            "title": title[:300],
            "datetime": _coerce_datetime(item.get("datetime")),
            "location": str(item.get("location") or "").strip()[:300],
        })

    return result


def _coerce_date(value) -> Optional[str]:
    if not value:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"null", "none", "n/a"}:
        return None
    # Already ISO date
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
        try:
            datetime.strptime(text, "%Y-%m-%d")
            return text
        except Exception:
            return None
    # ISO datetime — strip the time portion
    if "T" in text:
        try:
            return datetime.fromisoformat(text.replace("Z", "+00:00")).date().isoformat()
        except Exception:
            return None
    return None


def _coerce_time(value) -> Optional[str]:
    if not value:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"null", "none", "n/a"}:
        return None
    if re.fullmatch(r"\d{1,2}:\d{2}(:\d{2})?", text):
        try:
            parts = text.split(":")
            hours, minutes = int(parts[0]), int(parts[1])
            if 0 <= hours <= 23 and 0 <= minutes <= 59:
                return f"{hours:02d}:{minutes:02d}"
        except Exception:
            return None
    return None


def _coerce_datetime(value) -> Optional[str]:
    if not value:
        return None
    text = str(value).strip()
    if not text or text.lower() in {"null", "none", "n/a"}:
        return None
    try:
        # tolerate "Z" UTC marker
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
        return parsed.isoformat()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

def _warn_table_missing(exc: Exception) -> None:
    global _action_table_warned
    if _action_table_warned:
        return
    msg = str(exc).lower()
    if "42p01" in msg or "does not exist" in msg or "relation" in msg:
        _action_table_warned = True
        logger.error(
            "[Actions] TABLE MISSING: 'action_items' does not exist in Supabase. "
            "Run docs/supabase_action_items_migration.sql in the Supabase SQL editor."
        )
    elif "42501" in msg or "permission denied" in msg:
        _action_table_warned = True
        logger.error(
            "[Actions] INSERT DENIED on action_items: RLS or role permissions. "
            "Set SUPABASE_SERVICE_ROLE_KEY on Render."
        )


def save_action_items(user_id: str, transcript_id: str, extracted: dict) -> list[str]:
    """Insert one row per extracted task. Returns the list of inserted ids.
    Fails soft: returns [] and logs a warning if the table is missing or the
    write is rejected by RLS."""
    if not extracted:
        return []
    tasks = extracted.get("tasks") or []
    if not tasks:
        return []

    payloads = []
    for task in tasks:
        title = (task.get("title") or "").strip()
        if not title:
            continue
        payloads.append({
            "user_id": user_id or None,
            "transcript_id": transcript_id or None,
            "title": title[:300],
            "description": (task.get("description") or "")[:1000] or None,
            "person": (task.get("person") or "")[:200] or None,
            "due_date": task.get("due_date") or None,
            "due_time": task.get("due_time") or None,
            "status": "pending",
        })

    if not payloads:
        return []

    try:
        response = _client.table("action_items").insert(payloads).execute()
    except Exception as exc:
        _warn_table_missing(exc)
        logger.warning("[Actions] save_action_items insert failed: %s", exc)
        return []

    rows = response.data or []
    return [str(row.get("id")) for row in rows if row.get("id")]


def list_action_items(
    user_id: str,
    status: Optional[str] = None,
    limit: int = 25,
) -> list[dict]:
    """Read action items for a user. status=None returns all statuses."""
    try:
        query = (
            _client.table("action_items")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(max(1, min(limit, 100)))
        )
        if status:
            query = query.eq("status", status)
        response = query.execute()
    except Exception as exc:
        _warn_table_missing(exc)
        logger.warning("[Actions] list_action_items failed: %s", exc)
        return []
    return list(response.data or [])


def list_action_items_for_transcript(transcript_id: str) -> list[dict]:
    """Read every action item attached to a transcript, oldest first.
    Used by the calendar export so the .ics ordering matches insertion."""
    try:
        response = (
            _client.table("action_items")
            .select("*")
            .eq("transcript_id", transcript_id)
            .order("created_at", desc=False)
            .execute()
        )
    except Exception as exc:
        _warn_table_missing(exc)
        logger.warning("[Actions] list_action_items_for_transcript failed: %s", exc)
        return []
    return list(response.data or [])


def mark_action_done(action_id: str) -> bool:
    return _update_action_status(action_id, "done")


def mark_action_dismissed(action_id: str) -> bool:
    return _update_action_status(action_id, "dismissed")


def mark_transcript_actions_status(transcript_id: str, new_status: str) -> int:
    """Bulk-flip every pending action_item for a transcript to `new_status`.
    Returns the number of rows updated. Fails soft to 0."""
    if not transcript_id or new_status not in {"done", "dismissed", "pending"}:
        return 0
    try:
        response = (
            _client.table("action_items")
            .update({"status": new_status})
            .eq("transcript_id", transcript_id)
            .execute()
        )
    except Exception as exc:
        _warn_table_missing(exc)
        logger.warning("[Actions] bulk status update failed: %s", exc)
        return 0
    rows = response.data or []
    return len(rows)


def _update_action_status(action_id: str, new_status: str) -> bool:
    if not action_id:
        return False
    try:
        response = (
            _client.table("action_items")
            .update({"status": new_status})
            .eq("id", action_id)
            .execute()
        )
    except Exception as exc:
        _warn_table_missing(exc)
        logger.warning("[Actions] update %s -> %s failed: %s", action_id, new_status, exc)
        return False
    return bool(response.data)


# ---------------------------------------------------------------------------
# Urgent flag
# ---------------------------------------------------------------------------

_URGENT_KEYWORDS = (
    "today", "tomorrow", "tonight", "urgent", "urgently", "asap",
    "immediately", "right now", "deadline", "due now", "by end of day",
    "eod", "by tomorrow",
)


def _text_is_urgent(text: str) -> bool:
    if not text:
        return False
    lowered = str(text).lower()
    return any(kw in lowered for kw in _URGENT_KEYWORDS)


def mark_urgent_for_transcript(transcript_id: str, transcript_text: str = "") -> int:
    """Scan a transcript's action_items rows; flip priority='urgent' on any
    item whose title or description matches an urgency keyword. If
    `transcript_text` itself contains an urgency keyword, ALL pending items
    for that transcript are marked urgent (matches the spec literally).

    Returns the number of rows updated. Fail-soft on table missing."""
    try:
        rows = (
            _client.table("action_items")
            .select("id, title, description")
            .eq("transcript_id", transcript_id)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        _warn_table_missing(exc)
        return 0

    transcript_urgent = _text_is_urgent(transcript_text)
    to_update: list[str] = []
    for row in rows:
        if transcript_urgent or _text_is_urgent(
            f"{row.get('title') or ''} {row.get('description') or ''}"
        ):
            to_update.append(row["id"])

    if not to_update:
        return 0

    updated = 0
    for action_id in to_update:
        try:
            _client.table("action_items").update({"priority": "urgent"}).eq(
                "id", action_id
            ).execute()
            updated += 1
        except Exception as exc:
            _warn_table_missing(exc)
            logger.warning("[Actions] urgent flag failed for %s: %s", action_id, exc)
    return updated
