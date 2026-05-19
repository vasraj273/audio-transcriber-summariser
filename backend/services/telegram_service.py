"""Telegram bot adapter.

Wraps the Telegram Bot HTTP API directly with httpx (no aiogram/PTB
dependency on hot paths beyond what we need) so the service stays compatible
with the existing async FastAPI app and adds zero new background processes.

Key design decisions:
- Lazy token check (mirrors `assemblyai_service._ensure_configured`). Importing
  this module never raises, even when `TELEGRAM_BOT_TOKEN` is unset. Each
  outbound call raises a `RuntimeError` only at request time so the FastAPI
  app still boots cleanly.
- All public helpers are async-friendly; webhook handlers in
  `routes/telegram.py` call them with `await`.
- No global httpx client; we open one per call. Webhook traffic is low volume
  on the free tier so per-call client overhead is negligible and avoids the
  shutdown lifecycle headache.
"""

import json
import logging
import os
import re
from typing import Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_TELEGRAM_API_BASE = "https://api.telegram.org"
_MAX_TELEGRAM_FILE_BYTES = 20 * 1024 * 1024  # bot API hard limit for downloads
_SUMMARY_PREVIEW_CHARS = 500


def _bot_token() -> Optional[str]:
    """Return the configured token or None. Never raises."""
    return os.getenv("TELEGRAM_BOT_TOKEN")


def is_configured() -> bool:
    return bool(_bot_token())


def _require_token() -> str:
    token = _bot_token()
    if not token:
        raise RuntimeError(
            "TELEGRAM_BOT_TOKEN is not set. Add it to backend/.env locally and to "
            "the Render dashboard for production."
        )
    return token


def _api_url(method: str) -> str:
    return f"{_TELEGRAM_API_BASE}/bot{_require_token()}/{method}"


# ---------------------------------------------------------------------------
# File download
# ---------------------------------------------------------------------------

async def download_file(file_id: str) -> dict:
    """Fetch a Telegram-hosted file. Returns {bytes, filename, mime, size}.

    Raises RuntimeError on:
    - file > 20 MB (Telegram bot API limit)
    - getFile / file fetch failure
    """
    token = _require_token()
    async with httpx.AsyncClient(timeout=60.0) as client:
        meta_resp = await client.get(_api_url("getFile"), params={"file_id": file_id})
        meta_resp.raise_for_status()
        meta = meta_resp.json()
        if not meta.get("ok"):
            raise RuntimeError(f"Telegram getFile failed: {meta}")

        result = meta.get("result") or {}
        file_path = result.get("file_path") or ""
        size = int(result.get("file_size") or 0)

        if size and size > _MAX_TELEGRAM_FILE_BYTES:
            raise RuntimeError("TELEGRAM_FILE_TOO_LARGE")

        download_url = f"{_TELEGRAM_API_BASE}/file/bot{token}/{file_path}"
        file_resp = await client.get(download_url)
        file_resp.raise_for_status()
        content = file_resp.content

        if len(content) > _MAX_TELEGRAM_FILE_BYTES:
            raise RuntimeError("TELEGRAM_FILE_TOO_LARGE")

    filename = os.path.basename(file_path) or f"telegram_{file_id}"
    mime = _guess_mime(filename)
    return {"bytes": content, "filename": filename, "mime": mime, "size": len(content)}


def _guess_mime(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    return {
        ".ogg": "audio/ogg",
        ".oga": "audio/ogg",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".m4a": "audio/m4a",
        ".mp4": "video/mp4",
        ".webm": "video/webm",
    }.get(ext, "application/octet-stream")


# ---------------------------------------------------------------------------
# Send helpers
# ---------------------------------------------------------------------------

async def send_message(
    chat_id: int | str,
    text: str,
    buttons: Optional[list[list[dict]]] = None,
    reply_to_message_id: Optional[int] = None,
) -> dict:
    """Send a text message. `buttons` is a list-of-rows of {text, callback_data}."""
    payload: dict = {
        "chat_id": chat_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if buttons:
        payload["reply_markup"] = json.dumps({"inline_keyboard": buttons})
    if reply_to_message_id:
        payload["reply_to_message_id"] = reply_to_message_id

    return await _post("sendMessage", payload)


async def edit_message_text(
    chat_id: int | str,
    message_id: int,
    text: str,
    buttons: Optional[list[list[dict]]] = None,
) -> dict:
    payload: dict = {
        "chat_id": chat_id,
        "message_id": message_id,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    if buttons is not None:
        payload["reply_markup"] = json.dumps({"inline_keyboard": buttons})
    return await _post("editMessageText", payload)


async def send_chat_action(chat_id: int | str, action: str = "typing") -> None:
    try:
        await _post("sendChatAction", {"chat_id": chat_id, "action": action})
    except Exception as exc:  # chat actions are best-effort
        logger.warning("[Telegram] sendChatAction failed: %s", exc)


async def answer_callback_query(callback_query_id: str, text: str = "") -> None:
    try:
        await _post(
            "answerCallbackQuery",
            {"callback_query_id": callback_query_id, "text": text[:200]},
        )
    except Exception as exc:
        logger.warning("[Telegram] answerCallbackQuery failed: %s", exc)


async def send_document(
    chat_id: int | str,
    file_bytes: bytes,
    filename: str,
    caption: str = "",
) -> dict:
    token = _require_token()
    url = f"{_TELEGRAM_API_BASE}/bot{token}/sendDocument"
    data = {"chat_id": str(chat_id)}
    if caption:
        data["caption"] = caption[:1024]
    files = {"document": (filename, file_bytes, "application/pdf")}
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(url, data=data, files=files)
        resp.raise_for_status()
        return resp.json()


async def set_webhook(url: str) -> dict:
    """Register the webhook with Telegram. Public so the admin helper route
    can call it without re-implementing the API call."""
    return await _post("setWebhook", {"url": url, "drop_pending_updates": True})


async def _post(method: str, payload: dict) -> dict:
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(_api_url(method), json=payload)
        resp.raise_for_status()
        return resp.json()


# ---------------------------------------------------------------------------
# Reply formatting
# ---------------------------------------------------------------------------

# Telegram-friendly HTML — only <b>, <i>, <code>, <pre>, <a> allowed. We strip
# everything else from the raw summary so a stray "<" never breaks parse_mode.
def _html_escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


_URGENT_KEYWORDS = (
    "today", "tomorrow", "tonight", "urgent", "urgently", "asap",
    "immediately", "right now", "deadline", "due now", "by end of day",
    "eod", "by tomorrow",
)


def _is_urgent_text(text: str) -> bool:
    if not text:
        return False
    lowered = text.lower()
    return any(kw in lowered for kw in _URGENT_KEYWORDS)


def _format_duration(seconds: float) -> str:
    seconds = int(seconds or 0)
    if seconds <= 0:
        return "0:00"
    minutes, secs = divmod(seconds, 60)
    return f"{minutes}:{secs:02d}"


def format_result_reply(transcript_row: dict) -> str:
    """Build the user-facing Telegram reply per the spec.

    `transcript_row` is the same shape as `process_audio_file`'s result dict.
    """
    summary = (transcript_row.get("summary") or "").strip()
    if len(summary) > _SUMMARY_PREVIEW_CHARS:
        summary = summary[:_SUMMARY_PREVIEW_CHARS].rstrip() + "..."

    key_points = transcript_row.get("key_points") or []
    bullets = "\n".join(f"• {_html_escape(str(point).strip())}" for point in key_points if str(point).strip())
    if not bullets:
        bullets = "• (none extracted)"

    language = (transcript_row.get("detected_language") or "unknown").strip() or "unknown"
    duration = _format_duration(transcript_row.get("duration_seconds") or 0)

    warning = (transcript_row.get("warning") or "").strip()
    warning_block = f"\n\n⚠️ {_html_escape(warning)}" if warning else ""

    return (
        "📝 <b>Summary:</b>\n"
        f"{_html_escape(summary) or '(no summary)'}\n\n"
        "✅ <b>Action Items:</b>\n"
        f"{bullets}\n\n"
        f"🌐 <b>Language:</b> {_html_escape(language)}\n"
        f"⏱ <b>Duration:</b> {duration}"
        f"{warning_block}"
    )


def result_action_buttons(record_id: str) -> list[list[dict]]:
    """Inline keyboard for the result message."""
    if not record_id:
        return []
    return [
        [
            {"text": "📄 PDF", "callback_data": f"pdf:{record_id}"},
            {"text": "📧 Email me", "callback_data": f"email:{record_id}"},
        ],
        [
            {"text": "🌐 Translate", "callback_data": f"translate:{record_id}"},
            {"text": "💬 Ask Questions", "callback_data": f"ask:{record_id}"},
        ],
    ]


def result_action_buttons_with_actions(record_id: str) -> list[list[dict]]:
    """Extended inline keyboard for the AI-Actions enriched result message.

    Layout (per spec):
        [ ✅ Done ]      [ 📅 Calendar ]
        [ 📧 Email ]     [ 🌐 Translate ]
        [ 💬 Ask  ]      [ ❌ Dismiss ]

    PDF is intentionally dropped from this keyboard to keep it at 3 rows of 2
    buttons (Telegram inline buttons get cramped beyond that). Users can still
    type /tasks etc. for text-only views; PDF callback remains supported in
    case some older message still has the old keyboard rendered.
    """
    if not record_id:
        return []
    return [
        [
            {"text": "✅ Done", "callback_data": f"action:done:{record_id}"},
            {"text": "📅 Calendar", "callback_data": f"cal:{record_id}"},
        ],
        [
            {"text": "📧 Email", "callback_data": f"email:{record_id}"},
            {"text": "🌐 Translate", "callback_data": f"translate:{record_id}"},
        ],
        [
            {"text": "💬 Ask", "callback_data": f"ask:{record_id}"},
            {"text": "❌ Dismiss", "callback_data": f"action:dismiss:{record_id}"},
        ],
    ]


def format_actions_reply(transcript_row: dict, extracted: dict | None) -> str:
    """Build the Telegram reply that includes Action Items + Detected sections.

    Falls back to the existing Action Items block (built from key_points) when
    extraction produced no tasks. Detected People / Dates / Deadlines / Events
    sections are only rendered when they have content."""
    summary = (transcript_row.get("summary") or "").strip()
    if len(summary) > _SUMMARY_PREVIEW_CHARS:
        summary = summary[:_SUMMARY_PREVIEW_CHARS].rstrip() + "..."

    extracted = extracted or {}
    tasks = extracted.get("tasks") or []
    people = extracted.get("people") or []
    dates = extracted.get("dates") or []
    deadlines = extracted.get("deadlines") or []
    events = extracted.get("events") or []

    # Action Items source: prefer extracted tasks, fall back to key_points.
    if tasks:
        action_bullets = []
        for task in tasks:
            title_raw = str(task.get("title") or "").strip()
            title = _html_escape(title_raw)
            if not title:
                continue
            extras = []
            person = (task.get("person") or "").strip()
            if person:
                extras.append(_html_escape(person))
            due_date = (task.get("due_date") or "").strip()
            due_time = (task.get("due_time") or "").strip()
            if due_date and due_time:
                extras.append(_html_escape(f"{due_date} {due_time}"))
            elif due_date:
                extras.append(_html_escape(due_date))
            suffix = f" <i>({', '.join(extras)})</i>" if extras else ""
            descr_raw = str(task.get("description") or "").strip()
            urgent = _is_urgent_text(f"{title_raw} {descr_raw}")
            prefix = "🔴 " if urgent else ""
            action_bullets.append(f"• {prefix}{title}{suffix}")
        action_block = "\n".join(action_bullets) or "• (none extracted)"
    else:
        key_points = transcript_row.get("key_points") or []
        fallback = "\n".join(
            f"• {_html_escape(str(point).strip())}"
            for point in key_points if str(point).strip()
        )
        action_block = fallback or "• (none extracted)"

    language = (transcript_row.get("detected_language") or "unknown").strip() or "unknown"
    duration = _format_duration(transcript_row.get("duration_seconds") or 0)
    warning = (transcript_row.get("warning") or "").strip()
    warning_block = f"\n\n⚠️ {_html_escape(warning)}" if warning else ""

    detected_blocks: list[str] = []
    if people:
        detected_blocks.append(
            "👥 <b>Detected People:</b>\n"
            + ", ".join(_html_escape(p) for p in people)
        )
    if dates:
        detected_blocks.append(
            "📅 <b>Detected Dates:</b>\n"
            + ", ".join(_html_escape(d) for d in dates)
        )
    if deadlines:
        deadline_lines = []
        for item in deadlines:
            what = _html_escape((item.get("what") or "").strip())
            when = _html_escape((item.get("when") or "").strip())
            if what and when:
                deadline_lines.append(f"• {what} — {when}")
            elif what:
                deadline_lines.append(f"• {what}")
            elif when:
                deadline_lines.append(f"• {when}")
        if deadline_lines:
            detected_blocks.append("⏰ <b>Deadlines:</b>\n" + "\n".join(deadline_lines))
    if events:
        event_lines = []
        for ev in events:
            title = _html_escape((ev.get("title") or "").strip())
            if not title:
                continue
            extras = []
            dt = (ev.get("datetime") or "").strip()
            loc = (ev.get("location") or "").strip()
            if dt:
                extras.append(_html_escape(dt))
            if loc:
                extras.append(_html_escape(loc))
            suffix = f" <i>({', '.join(extras)})</i>" if extras else ""
            event_lines.append(f"• {title}{suffix}")
        if event_lines:
            detected_blocks.append("📌 <b>Events:</b>\n" + "\n".join(event_lines))

    detected_section = ("\n\n" + "\n\n".join(detected_blocks)) if detected_blocks else ""

    return (
        "📝 <b>Summary:</b>\n"
        f"{_html_escape(summary) or '(no summary)'}\n\n"
        "✅ <b>Action Items:</b>\n"
        f"{action_block}"
        f"{detected_section}"
        f"\n\n🌐 <b>Language:</b> {_html_escape(language)}"
        f"\n⏱ <b>Duration:</b> {duration}"
        f"{warning_block}"
    )


def build_ics(record_audio_name: str, items: list[dict]) -> bytes:
    """Build a minimal RFC 5545 .ics calendar containing one VEVENT per dated
    action item. Uses stdlib only — no icalendar dependency. Items without a
    `due_date` are skipped by the caller; this helper assumes the items it
    receives are already filtered."""
    from datetime import date as _date, datetime as _dt

    def _fold_line(line: str) -> str:
        # RFC 5545 lines should be folded at 75 octets. We keep it simple and
        # only fold if the line is unusually long.
        if len(line) <= 73:
            return line
        chunks = []
        i = 0
        while i < len(line):
            chunks.append(line[i:i + 73])
            i += 73
        return "\r\n ".join(chunks)

    def _esc(text: str) -> str:
        return (
            (text or "")
            .replace("\\", "\\\\")
            .replace(";", "\\;")
            .replace(",", "\\,")
            .replace("\n", "\\n")
        )

    now_stamp = _dt.utcnow().strftime("%Y%m%dT%H%M%SZ")
    audio_label = (record_audio_name or "transcript").replace("telegram:", "")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Audio Transcriber Summariser//Telegram Bot//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ]

    for index, item in enumerate(items):
        due_date = item.get("due_date")
        if not due_date:
            continue
        if isinstance(due_date, _date) and not isinstance(due_date, _dt):
            d_iso = due_date.isoformat()
        else:
            d_iso = str(due_date)
        try:
            d_obj = _dt.strptime(d_iso, "%Y-%m-%d").date()
        except Exception:
            continue

        due_time = item.get("due_time")
        if due_time:
            t_str = str(due_time)
            try:
                hh, mm = t_str.split(":")[:2]
                hh, mm = int(hh), int(mm)
                dt_start = _dt(d_obj.year, d_obj.month, d_obj.day, hh, mm, 0)
                dtstart = f"DTSTART:{dt_start.strftime('%Y%m%dT%H%M%S')}"
                dt_end = _dt(d_obj.year, d_obj.month, d_obj.day, hh, mm, 0)
                # +1 hour default duration
                dt_end_str = dt_end.replace(hour=(hh + 1) % 24).strftime('%Y%m%dT%H%M%S')
                dtend = f"DTEND:{dt_end_str}"
            except Exception:
                dtstart = f"DTSTART;VALUE=DATE:{d_obj.strftime('%Y%m%d')}"
                dtend = f"DTEND;VALUE=DATE:{d_obj.strftime('%Y%m%d')}"
        else:
            dtstart = f"DTSTART;VALUE=DATE:{d_obj.strftime('%Y%m%d')}"
            dtend = f"DTEND;VALUE=DATE:{d_obj.strftime('%Y%m%d')}"

        uid_source = str(item.get("id") or f"{audio_label}-{index}")
        summary_text = _esc(str(item.get("title") or "Task"))
        desc_parts = []
        if item.get("description"):
            desc_parts.append(str(item.get("description")))
        if item.get("person"):
            desc_parts.append(f"Assignee: {item.get('person')}")
        desc_parts.append(f"From audio: {audio_label}")
        description_text = _esc(" | ".join(desc_parts))

        lines.extend([
            "BEGIN:VEVENT",
            _fold_line(f"UID:{uid_source}@audio-transcriber-summariser"),
            f"DTSTAMP:{now_stamp}",
            _fold_line(dtstart),
            _fold_line(dtend),
            _fold_line(f"SUMMARY:{summary_text}"),
            _fold_line(f"DESCRIPTION:{description_text}"),
            "END:VEVENT",
        ])

    lines.append("END:VCALENDAR")
    return ("\r\n".join(lines) + "\r\n").encode("utf-8")


def help_text() -> str:
    return (
        "<b>Commands:</b>\n"
        "/start — show welcome\n"
        "/digest — today's AI brief\n"
        "/stats — productivity score\n"
        "/topics — recurring themes (7 days)\n"
        "/people — important people (7 days)\n"
        "/tasks or /pending — list pending action items\n"
        "/completed — list completed action items\n"
        "/timezone &lt;TZ&gt; — set your timezone, e.g. /timezone Asia/Kolkata\n"
        "/digest_on or /digest_off — toggle daily auto-digest\n"
        "/exit — leave ask / email mode\n"
        "/help — this message\n\n"
        "<b>Tips:</b>\n"
        "• Send any audio, voice note, or video — I'll transcribe, summarise, and extract tasks.\n"
        "• Use the inline buttons to mark Done, export to Calendar (.ics), Email, Translate, Ask, or Dismiss.\n"
        "• 🔴 = urgent task (mentions today / tomorrow / urgent / deadline / asap).\n"
    )


def welcome_text() -> str:
    return (
        "👋 Send me audio and I'll transcribe + summarize.\n\n"
        "<b>Supported:</b>\n"
        "🎤 Voice notes\n"
        "🎵 Audio files (MP3 / WAV / M4A / OGG)\n"
        "📞 Call recordings\n"
        "🎥 Meeting recordings (audio extracted)\n\n"
        "Just send. I'll handle the rest."
    )


# ---------------------------------------------------------------------------
# Misc helpers used by routes/telegram.py
# ---------------------------------------------------------------------------

EMAIL_REGEX = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def is_email(text: str) -> bool:
    return bool(EMAIL_REGEX.match((text or "").strip()))
