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
