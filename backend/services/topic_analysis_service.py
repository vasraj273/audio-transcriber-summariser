"""Topic + people extraction for the V4 Daily Intelligence layer.

A single Groq Llama pass turns the last N days of summaries into a small
JSON blob of `{topics, people}` with mention counts. Results are persisted
to `topic_stats` and `people_stats` so /topics, /people, and the digest
all read from the cached window without re-hitting the LLM.

Reuses `groq_service._llama_complete` for the automatic 70B -> 8B-instant
fallback that's already in place.

Fail-soft: every read/write swallows DB errors and returns the empty shape
so the digest still ships even when the new migration hasn't been applied.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from services.groq_service import _llama_complete
from services.supabase_service import _client  # type: ignore[attr-defined]

logger = logging.getLogger(__name__)

# Per-summary truncation + overall prompt cap so a big history doesn't blow context.
_PER_SUMMARY_CHARS = 400
_PROMPT_CHAR_CAP = 6000


def _empty() -> dict[str, list]:
    return {"topics": [], "people": []}


# ---------------------------------------------------------------------------
# LLM extraction
# ---------------------------------------------------------------------------

def extract_topics(transcripts: list[dict], top_k: int = 8) -> dict[str, list]:
    """One Groq Llama pass that pulls recurring topics + named people out of
    the concatenated summaries. Returns the empty shape on any failure."""
    if not transcripts:
        return _empty()

    # Build the corpus the model will read. Truncate each summary then cap
    # the whole prompt so we don't blow past the model context.
    pieces: list[str] = []
    used = 0
    for index, t in enumerate(transcripts):
        summary = (t.get("summary") or "").strip()
        if not summary:
            continue
        clipped = summary[:_PER_SUMMARY_CHARS]
        line = f"[{index + 1}] {clipped}"
        if used + len(line) > _PROMPT_CHAR_CAP:
            break
        pieces.append(line)
        used += len(line)

    if not pieces:
        return _empty()

    corpus = "\n".join(pieces)

    system_prompt = (
        "You extract recurring topics and named people from a batch of "
        "short transcript summaries. Respond with a single JSON object and "
        "nothing else. No prose. No code fences."
    )
    user_prompt = f"""Read the summaries below (each prefixed [n]) and return at most {top_k} topics and {top_k} people.

Rules:
- Output English labels even if the source is in another language.
- `mentions` is your best estimate of how many of the [n] summaries discuss that topic / person.
- Only include real recurring themes — discard generic words.
- Empty arrays are fine.

Summaries:
\"\"\"
{corpus}
\"\"\"

Respond with exactly this JSON shape and nothing else:
{{"topics":[{{"label":"...","mentions":1}}],"people":[{{"name":"...","mentions":1}}]}}
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
        logger.warning("[TopicAnalysis] LLM call failed: %s", exc)
        return _empty()

    parsed = _safe_parse_json(raw)
    if not isinstance(parsed, dict):
        logger.warning("[TopicAnalysis] could not parse JSON: %s", (raw or "")[:200])
        return _empty()

    topics: list[dict] = []
    for item in parsed.get("topics") or []:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip()
        if not label:
            continue
        topics.append({
            "label": label[:200],
            "mentions": _safe_int(item.get("mentions"), default=1),
        })

    people: list[dict] = []
    for item in parsed.get("people") or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        people.append({
            "name": name[:200],
            "mentions": _safe_int(item.get("mentions"), default=1),
        })

    topics.sort(key=lambda x: x["mentions"], reverse=True)
    people.sort(key=lambda x: x["mentions"], reverse=True)
    return {"topics": topics[:top_k], "people": people[:top_k]}


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return max(1, int(value))
    except (TypeError, ValueError):
        return default


def _safe_parse_json(raw: str) -> Optional[dict]:
    if not raw:
        return None
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text, flags=re.IGNORECASE)
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
    try:
        return json.loads(text)
    except Exception:
        pass
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


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

def refresh_topic_window(user_id: str, days: int = 7) -> dict[str, Any]:
    """Recompute the rolling N-day topic + people window for a user.

    Reads completed transcripts in the window, runs the LLM extractor, and
    REPLACES that user's `topic_stats` / `people_stats` rows for the current
    window_end date.

    Fail-soft: returns empty payload if tables are missing or any step fails.
    """
    if not user_id:
        return {"topics": [], "people": [], "window_days": days}

    window_end = date.today()
    window_start = window_end - timedelta(days=max(1, days))
    since_iso = datetime.combine(window_start, datetime.min.time(), tzinfo=timezone.utc).isoformat()

    try:
        rows = (
            _client.table("transcripts")
            .select("id, summary, transcript, created_at")
            .eq("user_id", user_id)
            .eq("status", "completed")
            .gte("created_at", since_iso)
            .order("created_at", desc=True)
            .limit(60)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        logger.warning("[TopicAnalysis] transcripts read failed: %s", exc)
        return {"topics": [], "people": [], "window_days": days}

    # Strip rows with no transcript text — they have nothing useful for theme detection.
    rows = [r for r in rows if (r.get("transcript") or "").strip()]

    if not rows:
        # Still clear the stale window so old themes don't linger forever.
        _replace_window(user_id, window_start, window_end, topics=[], people=[])
        return {"topics": [], "people": [], "window_days": days}

    extracted = extract_topics(rows)
    _replace_window(
        user_id,
        window_start,
        window_end,
        topics=extracted.get("topics") or [],
        people=extracted.get("people") or [],
    )
    return {**extracted, "window_days": days}


def _replace_window(
    user_id: str,
    window_start: date,
    window_end: date,
    *,
    topics: list[dict],
    people: list[dict],
) -> None:
    """Delete-then-insert the rolling window for a user. Fail-soft on each side."""
    try:
        _client.table("topic_stats").delete().eq("user_id", user_id).eq(
            "window_end", window_end.isoformat()
        ).execute()
    except Exception as exc:
        logger.warning("[TopicAnalysis] topic_stats delete failed: %s", exc)

    try:
        _client.table("people_stats").delete().eq("user_id", user_id).eq(
            "window_end", window_end.isoformat()
        ).execute()
    except Exception as exc:
        logger.warning("[TopicAnalysis] people_stats delete failed: %s", exc)

    topic_payloads = [
        {
            "user_id": user_id,
            "topic": str(t.get("label") or "")[:200],
            "mentions": int(t.get("mentions") or 1),
            "window_start": window_start.isoformat(),
            "window_end": window_end.isoformat(),
        }
        for t in topics
        if (t.get("label") or "").strip()
    ]
    people_payloads = [
        {
            "user_id": user_id,
            "person": str(p.get("name") or "")[:200],
            "mentions": int(p.get("mentions") or 1),
            "window_start": window_start.isoformat(),
            "window_end": window_end.isoformat(),
        }
        for p in people
        if (p.get("name") or "").strip()
    ]

    if topic_payloads:
        try:
            _client.table("topic_stats").insert(topic_payloads).execute()
        except Exception as exc:
            logger.warning("[TopicAnalysis] topic_stats insert failed: %s", exc)

    if people_payloads:
        try:
            _client.table("people_stats").insert(people_payloads).execute()
        except Exception as exc:
            logger.warning("[TopicAnalysis] people_stats insert failed: %s", exc)


def recurring_themes(user_id: str, days: int = 7, min_mentions: int = 3) -> list[dict]:
    """Return the latest cached topic_stats window for a user, filtered to
    `mentions >= min_mentions`. Fail-soft to []."""
    if not user_id:
        return []
    try:
        rows = (
            _client.table("topic_stats")
            .select("topic, mentions, window_start, window_end")
            .eq("user_id", user_id)
            .order("window_end", desc=True)
            .limit(50)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        logger.warning("[TopicAnalysis] recurring_themes read failed: %s", exc)
        return []

    if not rows:
        return []

    # Keep only the most recent window_end the user has on file.
    latest_end = rows[0].get("window_end")
    latest_rows = [r for r in rows if r.get("window_end") == latest_end]

    filtered = [
        {"label": r.get("topic"), "mentions": int(r.get("mentions") or 0)}
        for r in latest_rows
        if (r.get("topic") or "").strip() and int(r.get("mentions") or 0) >= min_mentions
    ]
    filtered.sort(key=lambda x: x["mentions"], reverse=True)
    return filtered


def latest_people(user_id: str, limit: int = 8) -> list[dict]:
    """Return the latest cached people_stats window for a user. Fail-soft to []."""
    if not user_id:
        return []
    try:
        rows = (
            _client.table("people_stats")
            .select("person, mentions, window_end")
            .eq("user_id", user_id)
            .order("window_end", desc=True)
            .limit(50)
            .execute()
            .data
            or []
        )
    except Exception as exc:
        logger.warning("[TopicAnalysis] latest_people read failed: %s", exc)
        return []
    if not rows:
        return []
    latest_end = rows[0].get("window_end")
    latest_rows = [r for r in rows if r.get("window_end") == latest_end]
    result = [
        {"name": r.get("person"), "mentions": int(r.get("mentions") or 0)}
        for r in latest_rows
        if (r.get("person") or "").strip()
    ]
    result.sort(key=lambda x: x["mentions"], reverse=True)
    return result[:limit]
