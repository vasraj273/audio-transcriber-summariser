"""Telegram bot webhook.

Sits on top of the existing FastAPI app and reuses the same processing
pipeline that `routes/jobs.py` drives for the web UI. We deliberately do NOT
modify any other route: this file imports `process_audio_file` from
`routes/process.py`, persists via `services/supabase_service`, and emits the
same analytics event the web flow does.

Persistence model:
- One Telegram chat == one synthetic user. `user_id` is a deterministic UUIDv5
  derived from `telegram:<chat_id>` so repeat uploads from the same chat
  always land in the same History bucket.

Per-chat in-memory state:
- `_AWAITING_EMAIL[chat_id]` — record_id we're about to email once the user
  replies with an email address.
- `_ASK_MODE[chat_id]` — record_id of the transcript the next plain-text
  message should be asked against.
Both are intentionally process-local; restarts wipe them and the user just
re-clicks the button. No DB churn for transient UI state.
"""

import io
import json
import logging
import os
import smtplib
import tempfile

import httpx
import time
import traceback
import uuid
from email.message import EmailMessage
from typing import Optional

from fastapi import APIRouter, HTTPException, Request

from routes.process import process_audio_file
from services import actions_service, telegram_service
from services.analytics_service import record_transcript_event
from services.groq_service import chat_with_audio, summarise_transcript
from services.supabase_service import (
    complete_transcript,
    create_processing_transcript,
    fail_transcript,
    get_transcript_by_job,
    mark_transcript_processing,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/telegram", tags=["telegram"])

# Deterministic namespace so the same chat always maps to the same user_id.
_TELEGRAM_NS = uuid.uuid5(uuid.NAMESPACE_DNS, "telegram.audio-transcriber")

# Chat-id -> record_id we're about to email once the user replies with an address.
_AWAITING_EMAIL: dict[int, str] = {}
# Chat-id -> record_id the next plain-text message should be Q&A'd against.
_ASK_MODE: dict[int, str] = {}

_SUPPORTED_EXTS = {".mp3", ".wav", ".m4a", ".ogg", ".oga", ".mp4", ".webm"}


def _chat_user_id(chat_id: int | str) -> str:
    return str(uuid.uuid5(_TELEGRAM_NS, f"telegram:{chat_id}"))


def _ensure_supported_ext(filename: str) -> str:
    """Normalise a Telegram-supplied filename to an extension our pipeline
    will accept. Returns the normalised extension (with dot) or raises
    ValueError on a truly unsupported type."""
    ext = os.path.splitext(filename)[1].lower()
    if ext in _SUPPORTED_EXTS:
        return ext
    raise ValueError(f"Unsupported file extension: {ext or '(none)'}")


def _telegram_to_pipeline_ext(ext: str) -> str:
    """Map Telegram-native containers (.ogg voice notes, .mp4/.webm video
    notes) to the closest extension our `_validate_file` accepts. The
    underlying ffmpeg-backed AssemblyAI/Groq Whisper APIs don't care about
    the suffix — they sniff content — so the rename is purely to satisfy
    `process_audio_file`'s naive extension check."""
    if ext in {".mp3", ".wav", ".m4a"}:
        return ext
    # Voice notes (ogg/opus) and video notes (mp4/webm): rename to .m4a so the
    # ALLOWED_EXTENSIONS gate in process.py passes. Real transcription still
    # works because the providers detect format from bytes.
    return ".m4a"


# ---------------------------------------------------------------------------
# Webhook entry point
# ---------------------------------------------------------------------------

@router.post("/webhook")
async def telegram_webhook(request: Request) -> dict:
    if not telegram_service.is_configured():
        raise HTTPException(status_code=503, detail="Telegram bot not configured.")

    try:
        update = await request.json()
    except Exception as exc:
        logger.warning("[Telegram] could not parse update body: %s", exc)
        return {"ok": False, "error": "invalid json"}

    try:
        await _dispatch_update(update)
    except Exception as exc:
        logger.error("[Telegram] dispatch failed: %s\n%s", exc, traceback.format_exc())
        # Always return 200 so Telegram doesn't retry the same update forever.
    return {"ok": True}


async def _dispatch_update(update: dict) -> None:
    if "callback_query" in update:
        await _handle_callback(update["callback_query"])
        return

    message = update.get("message") or update.get("edited_message")
    if not message:
        return

    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    if chat_id is None:
        return

    # /start (or any /command)
    text = (message.get("text") or "").strip()
    if text.startswith("/start"):
        _ASK_MODE.pop(chat_id, None)
        _AWAITING_EMAIL.pop(chat_id, None)
        await telegram_service.send_message(chat_id, telegram_service.welcome_text())
        return

    if text.startswith("/help"):
        await telegram_service.send_message(chat_id, telegram_service.help_text())
        return

    if text.startswith("/tasks") or text.startswith("/pending"):
        await _send_action_list(chat_id, status="pending", header="📝 <b>Pending tasks</b>")
        return

    if text.startswith("/completed"):
        await _send_action_list(chat_id, status="done", header="✅ <b>Completed tasks</b>")
        return

    if text.startswith("/exit") or text.startswith("/cancel") or text.startswith("/stop"):
        was_ask = _ASK_MODE.pop(chat_id, None)
        was_email = _AWAITING_EMAIL.pop(chat_id, None)
        if was_ask:
            await telegram_service.send_message(chat_id, "Exited ask mode. Send audio to transcribe.")
        elif was_email:
            await telegram_service.send_message(chat_id, "Email cancelled.")
        else:
            await telegram_service.send_message(chat_id, "Nothing to exit. Send audio to transcribe.")
        return

    # Audio-bearing message?
    media = _extract_media(message)
    if media:
        await _handle_audio_message(chat_id, message, media)
        return

    # Text message — context-dependent
    if text:
        # Email collection flow
        record_id = _AWAITING_EMAIL.pop(chat_id, None)
        if record_id:
            await _handle_email_reply(chat_id, record_id, text)
            return

        # Ask-mode flow
        ask_record_id = _ASK_MODE.get(chat_id)
        if ask_record_id:
            await _handle_ask_reply(chat_id, ask_record_id, text)
            return

        await telegram_service.send_message(
            chat_id,
            "Send me an audio or voice note and I'll transcribe it. Type /start for help.",
        )
        return


# ---------------------------------------------------------------------------
# Media extraction
# ---------------------------------------------------------------------------

def _extract_media(message: dict) -> Optional[dict]:
    """Return {file_id, filename, source} for any audio-bearing field on a
    Telegram message, or None if there isn't one. Telegram exposes 5
    different fields for what is conceptually 'a sound clip'."""
    if message.get("voice"):
        voice = message["voice"]
        return {
            "file_id": voice["file_id"],
            "filename": f"voice_{message.get('message_id', 'x')}.ogg",
            "source": "voice",
        }
    if message.get("audio"):
        audio = message["audio"]
        filename = audio.get("file_name") or f"audio_{message.get('message_id', 'x')}.mp3"
        return {"file_id": audio["file_id"], "filename": filename, "source": "audio"}
    if message.get("video_note"):
        vn = message["video_note"]
        return {
            "file_id": vn["file_id"],
            "filename": f"videonote_{message.get('message_id', 'x')}.mp4",
            "source": "video_note",
        }
    if message.get("video"):
        v = message["video"]
        filename = v.get("file_name") or f"video_{message.get('message_id', 'x')}.mp4"
        return {"file_id": v["file_id"], "filename": filename, "source": "video"}
    if message.get("document"):
        doc = message["document"]
        mime = (doc.get("mime_type") or "").lower()
        filename = doc.get("file_name") or f"doc_{message.get('message_id', 'x')}"
        if mime.startswith("audio/") or mime.startswith("video/") or os.path.splitext(filename)[1].lower() in _SUPPORTED_EXTS:
            return {"file_id": doc["file_id"], "filename": filename, "source": "document"}
    return None


# ---------------------------------------------------------------------------
# Audio handling
# ---------------------------------------------------------------------------

async def _handle_audio_message(chat_id: int, message: dict, media: dict) -> None:
    user_id = _chat_user_id(chat_id)
    message_id = message.get("message_id")
    original_name = media["filename"]
    audio_name = f"telegram:{original_name}"

    # Validate ext up front so we fail fast with a friendly message.
    try:
        ext = _ensure_supported_ext(original_name)
    except ValueError:
        await telegram_service.send_message(
            chat_id,
            "Hmm, I can't process that file type. Send an audio (MP3, WAV, M4A, OGG) "
            "or a voice/video note.",
            reply_to_message_id=message_id,
        )
        return

    await telegram_service.send_chat_action(chat_id, "typing")
    await telegram_service.send_message(
        chat_id,
        "⏳ Processing — this may take a minute…",
        reply_to_message_id=message_id,
    )

    # Download from Telegram
    try:
        file_data = await telegram_service.download_file(media["file_id"])
    except RuntimeError as exc:
        if "TELEGRAM_FILE_TOO_LARGE" in str(exc):
            await telegram_service.send_message(
                chat_id,
                "📦 File too big. Telegram limits bot downloads to 20MB. Use a smaller clip.",
            )
        else:
            logger.exception("[Telegram] download_file failed")
            await telegram_service.send_message(
                chat_id,
                "Couldn't fetch your file from Telegram. Try sending it again.",
            )
        return
    except Exception:
        logger.exception("[Telegram] download_file raised unexpectedly")
        await telegram_service.send_message(
            chat_id,
            "Couldn't fetch your file from Telegram. Try sending it again.",
        )
        return

    job_id = str(uuid.uuid4())
    options = {
        "output_language": "English",
        "summary_focus": "General Summary",
        "summary_format": "Bullet Points",
        "summary_length": "Medium",
        "custom_focus": "",
    }

    # Persistence: queue row + temp file with a pipeline-friendly extension.
    pipeline_ext = _telegram_to_pipeline_ext(ext)
    record_id = ""
    try:
        record_id = create_processing_transcript(
            job_id=job_id,
            user_id=user_id,
            audio_name=audio_name,
            options=options,
        )
    except Exception as exc:
        logger.exception("[Telegram] create_processing_transcript failed")
        await telegram_service.send_message(
            chat_id,
            "Couldn't start processing — something went wrong on our side. Please try again in a minute.",
        )
        return

    tmp_path = ""
    start_ts = time.perf_counter()
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=pipeline_ext) as tmp:
            tmp.write(file_data["bytes"])
            tmp_path = tmp.name

        mark_transcript_processing(job_id)
        result = process_audio_file(tmp_path, options)
        complete_transcript(job_id, result)
        _emit_event(record_id, job_id, user_id, result, "completed", None)

        # SECOND LLM pass: extract structured tasks / people / dates / etc.
        # Failure here is non-fatal — we still send the summary.
        extracted = None
        try:
            extracted = actions_service.extract_actions(
                transcript=result.get("transcript") or "",
                summary=result.get("summary") or "",
                language=result.get("detected_language"),
            )
            if extracted and record_id:
                try:
                    actions_service.save_action_items(user_id, record_id, extracted)
                except Exception:
                    logger.exception("[Telegram] save_action_items failed for record %s", record_id)
        except Exception:
            logger.exception("[Telegram] extract_actions failed for record %s", record_id)
            extracted = None

        if extracted:
            reply_text = telegram_service.format_actions_reply(result, extracted)
        else:
            # Degrade gracefully to the old summary-only reply.
            reply_text = telegram_service.format_result_reply(result)

        await telegram_service.send_message(
            chat_id,
            reply_text,
            buttons=telegram_service.result_action_buttons_with_actions(record_id),
            reply_to_message_id=message_id,
        )
    except Exception as exc:
        message_str = str(exc) or "Processing failed."
        logger.exception("[Telegram] processing failed for job_id=%s", job_id)
        try:
            fail_transcript(job_id, message_str)
        except Exception:
            pass
        _emit_event(record_id, job_id, user_id, {}, "failed", message_str)
        await telegram_service.send_message(
            chat_id,
            "Couldn't process this one. Try a clearer recording.",
        )
    finally:
        if tmp_path:
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        elapsed = int((time.perf_counter() - start_ts) * 1000)
        logger.info("[Telegram] job_id=%s elapsed_ms=%d", job_id, elapsed)


def _emit_event(
    record_id: str,
    job_id: str,
    user_id: str,
    result: dict,
    status: str,
    error_message: Optional[str],
) -> None:
    """Mirror routes/jobs.py::_emit_transcript_event but with Telegram-tagged
    provider so analytics can distinguish channels."""
    try:
        provider = result.get("transcription_provider") or "unknown"
        record_transcript_event(
            transcript_id=record_id or None,
            job_id=job_id,
            user_id=user_id,
            duration_seconds=float(result.get("duration_seconds") or 0),
            language=result.get("detected_language"),
            audio_type=result.get("audio_type"),
            provider_used=f"telegram+{provider}",
            credits_used=0,
            processing_ms=result.get("processing_ms"),
            transcript_status=status,
            error_message=error_message,
        )
    except Exception as exc:
        logger.warning("[Telegram] analytics emit failed job_id=%s: %s", job_id, exc)


# ---------------------------------------------------------------------------
# Callback queries (inline button clicks)
# ---------------------------------------------------------------------------

async def _handle_callback(callback: dict) -> None:
    callback_id = callback.get("id", "")
    data = callback.get("data") or ""
    message = callback.get("message") or {}
    chat = message.get("chat") or {}
    chat_id = chat.get("id")
    message_id = message.get("message_id")

    if not data or chat_id is None:
        await telegram_service.answer_callback_query(callback_id, "")
        return

    # Callback data scheme:
    #   pdf:<id>        email:<id>        translate:<id>       ask:<id>   (legacy)
    #   cal:<id>                                                          (calendar export)
    #   action:done:<id>        action:dismiss:<id>                       (bulk task ops)
    parts = data.split(":")
    if len(parts) < 2:
        await telegram_service.answer_callback_query(callback_id, "Bad action.")
        return

    if parts[0] == "action":
        if len(parts) < 3:
            await telegram_service.answer_callback_query(callback_id, "Bad action.")
            return
        action = f"action:{parts[1]}"
        record_id = ":".join(parts[2:])
    else:
        action = parts[0]
        record_id = ":".join(parts[1:])

    if not record_id:
        await telegram_service.answer_callback_query(callback_id, "Missing record.")
        return

    try:
        if action == "pdf":
            await telegram_service.answer_callback_query(callback_id, "Building PDF…")
            await _action_pdf(chat_id, record_id)
        elif action == "email":
            await telegram_service.answer_callback_query(callback_id, "")
            _AWAITING_EMAIL[chat_id] = record_id
            await telegram_service.send_message(
                chat_id,
                "📧 Send me the email address you'd like the summary delivered to.",
            )
        elif action == "translate":
            await telegram_service.answer_callback_query(callback_id, "Translating…")
            await _action_translate(chat_id, record_id, message_id)
        elif action == "ask":
            await telegram_service.answer_callback_query(callback_id, "Ask mode on")
            _ASK_MODE[chat_id] = record_id
            await telegram_service.send_message(
                chat_id,
                "💬 Ask mode is on. Send a question and I'll answer using this audio. "
                "Send /exit to leave ask mode.",
            )
        elif action == "cal":
            await telegram_service.answer_callback_query(callback_id, "Building calendar…")
            await _action_calendar(chat_id, record_id)
        elif action == "action:done":
            await telegram_service.answer_callback_query(callback_id, "Marking done…")
            await _action_mark_all(chat_id, record_id, message_id, new_status="done")
        elif action == "action:dismiss":
            await telegram_service.answer_callback_query(callback_id, "Dismissing…")
            await _action_mark_all(chat_id, record_id, message_id, new_status="dismissed")
        else:
            await telegram_service.answer_callback_query(callback_id, "Unknown action.")
    except Exception:
        logger.exception("[Telegram] callback %s failed for record %s", action, record_id)
        await telegram_service.send_message(
            chat_id,
            "Something went wrong with that action. Try again in a moment.",
        )


# ---------------------------------------------------------------------------
# Action: PDF
# ---------------------------------------------------------------------------

async def _action_pdf(chat_id: int, record_id: str) -> None:
    record = _fetch_record_by_id(record_id)
    if not record:
        await telegram_service.send_message(chat_id, "Couldn't find that transcript anymore.")
        return

    try:
        pdf_bytes = _build_pdf(record)
    except RuntimeError as exc:
        # reportlab missing — degrade gracefully
        await telegram_service.send_message(chat_id, str(exc))
        return
    except Exception:
        logger.exception("[Telegram] pdf build failed for record %s", record_id)
        await telegram_service.send_message(chat_id, "Couldn't build the PDF. Please try again later.")
        return

    filename_base = (record.get("audio_name") or "transcript").replace("telegram:", "")
    safe_base = "".join(ch if ch.isalnum() or ch in "._- " else "_" for ch in filename_base).strip() or "transcript"
    await telegram_service.send_document(
        chat_id,
        pdf_bytes,
        f"{safe_base}.pdf",
        caption="Here's your transcript + summary.",
    )


def _build_pdf(record: dict) -> bytes:
    """Build a simple text PDF from a transcript row. Uses reportlab (added
    to requirements.txt). Raises RuntimeError with a friendly message if
    reportlab is not installed yet."""
    try:
        from reportlab.lib.pagesizes import LETTER
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch
        from reportlab.platypus import (
            SimpleDocTemplate,
            Paragraph,
            Spacer,
        )
    except ImportError:
        raise RuntimeError(
            "PDF export isn't available yet — reportlab needs to be installed. "
            "Please ask the admin to run pip install -r requirements.txt."
        )

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=LETTER,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch,
        title="Audio Transcript",
    )

    styles = getSampleStyleSheet()
    body = ParagraphStyle("body", parent=styles["BodyText"], fontSize=10, leading=14)
    h1 = ParagraphStyle("h1", parent=styles["Heading1"], fontSize=16, leading=20, spaceAfter=8)
    h2 = ParagraphStyle("h2", parent=styles["Heading2"], fontSize=12, leading=16, spaceBefore=10, spaceAfter=6)

    audio_name = (record.get("audio_name") or "Audio").replace("telegram:", "")
    language = record.get("detected_language") or "unknown"
    duration_s = float(record.get("duration_seconds") or 0)

    flow = []
    flow.append(Paragraph(_pdf_escape(f"Transcript: {audio_name}"), h1))
    flow.append(Paragraph(_pdf_escape(f"Language: {language}  |  Duration: {duration_s:.1f}s"), body))
    flow.append(Spacer(1, 0.15 * inch))

    summary = (record.get("summary") or "").strip()
    if summary:
        flow.append(Paragraph("Summary", h2))
        for para in summary.split("\n"):
            if para.strip():
                flow.append(Paragraph(_pdf_escape(para), body))

    key_points = record.get("key_points") or []
    if key_points:
        flow.append(Paragraph("Action Items", h2))
        for point in key_points:
            text = str(point).strip()
            if text:
                flow.append(Paragraph(_pdf_escape(f"• {text}"), body))

    transcript = (record.get("transcript") or "").strip()
    if transcript:
        flow.append(Paragraph("Full Transcript", h2))
        for para in transcript.split("\n"):
            if para.strip():
                flow.append(Paragraph(_pdf_escape(para), body))

    doc.build(flow)
    return buffer.getvalue()


def _pdf_escape(text: str) -> str:
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


# ---------------------------------------------------------------------------
# Action: Email
# ---------------------------------------------------------------------------

async def _handle_email_reply(chat_id: int, record_id: str, raw_email: str) -> None:
    if not telegram_service.is_email(raw_email):
        # Put them back into awaiting-email mode so they can retry without re-clicking.
        _AWAITING_EMAIL[chat_id] = record_id
        await telegram_service.send_message(
            chat_id,
            "That doesn't look like a valid email. Try again, e.g. you@example.com",
        )
        return

    record = _fetch_record_by_id(record_id)
    if not record:
        await telegram_service.send_message(chat_id, "Couldn't find that transcript anymore.")
        return

    if not _email_configured():
        await telegram_service.send_message(chat_id, "Email not configured.")
        return

    try:
        await _send_summary_email(raw_email.strip(), record)
    except Exception:
        logger.exception("[Telegram] Email send failed")
        await telegram_service.send_message(
            chat_id,
            "Couldn't send the email. Please try again later or use the PDF button.",
        )
        return

    await telegram_service.send_message(chat_id, f"📧 Sent to {raw_email.strip()}.")


def _email_configured() -> bool:
    if os.getenv("RESEND_API_KEY") and os.getenv("EMAIL_FROM"):
        return True
    return all(
        os.getenv(name)
        for name in ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM")
    )


def _smtp_configured() -> bool:
    return _email_configured()


async def _send_summary_email(to_addr: str, record: dict) -> None:
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT") or 587)
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")
    sender = os.getenv("SMTP_FROM")
    use_ssl = (os.getenv("SMTP_USE_SSL") or "").lower() in {"1", "true", "yes"}

    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to_addr
    msg["Subject"] = f"Transcript: {(record.get('audio_name') or 'Audio').replace('telegram:', '')}"

    summary = (record.get("summary") or "").strip()
    key_points = record.get("key_points") or []
    transcript = (record.get("transcript") or "").strip()
    language = record.get("detected_language") or "unknown"
    duration_s = float(record.get("duration_seconds") or 0)

    bullets = "\n".join(f"- {str(p).strip()}" for p in key_points if str(p).strip()) or "(none)"
    body = (
        f"Summary:\n{summary or '(no summary)'}\n\n"
        f"Action Items:\n{bullets}\n\n"
        f"Language: {language}\n"
        f"Duration: {duration_s:.1f}s\n\n"
        f"--- Full Transcript ---\n{transcript}"
    )
    msg.set_content(body)

    # Prefer Resend HTTP API (works on Render free tier where SMTP is blocked).
    resend_key = os.getenv("RESEND_API_KEY")
    if resend_key:
        await _send_via_resend(to_addr, msg["Subject"], body, resend_key)
        return

    if use_ssl:
        with smtplib.SMTP_SSL(host, port, timeout=30) as smtp:
            smtp.login(user, password)
            smtp.send_message(msg)
    else:
        with smtplib.SMTP(host, port, timeout=30) as smtp:
            smtp.starttls()
            smtp.login(user, password)
            smtp.send_message(msg)


async def _send_via_resend(to_addr: str, subject: str, body: str, api_key: str) -> None:
    sender = os.getenv("EMAIL_FROM") or os.getenv("SMTP_FROM")
    if not sender:
        raise RuntimeError("EMAIL_FROM (or SMTP_FROM) must be set for Resend")
    payload = {
        "from": sender,
        "to": [to_addr],
        "subject": subject,
        "text": body,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
        if resp.status_code >= 300:
            raise RuntimeError(f"Resend API error {resp.status_code}: {resp.text}")


# ---------------------------------------------------------------------------
# Action: Translate
# ---------------------------------------------------------------------------

async def _action_translate(chat_id: int, record_id: str, message_id: Optional[int]) -> None:
    record = _fetch_record_by_id(record_id)
    if not record:
        await telegram_service.send_message(chat_id, "Couldn't find that transcript anymore.")
        return

    transcript_text = (record.get("transcript") or "").strip()
    if not transcript_text:
        await telegram_service.send_message(chat_id, "No transcript text to translate.")
        return

    try:
        result = summarise_transcript(
            transcript=transcript_text,
            output_language="English",  # default target; spec says use existing groq path
            focus="General Summary",
            format="Bullet Points",
            length="Medium",
            custom_focus="",
        )
    except Exception:
        logger.exception("[Telegram] translate (summarise) failed")
        await telegram_service.send_message(
            chat_id,
            "Couldn't translate right now. The AI service might be rate-limited — try again in a minute.",
        )
        return

    # Send as a fresh message (rather than edit the original) so the buttons
    # on the first result stay clickable.
    translated_record = dict(record)
    translated_record["summary"] = result.get("summary") or ""
    translated_record["key_points"] = result.get("key_points") or []

    text = telegram_service.format_result_reply(translated_record)
    await telegram_service.send_message(
        chat_id,
        "🌐 <b>Translated to English:</b>\n\n" + text,
        reply_to_message_id=message_id,
    )


# ---------------------------------------------------------------------------
# Action: Ask Questions
# ---------------------------------------------------------------------------

async def _handle_ask_reply(chat_id: int, record_id: str, question: str) -> None:
    # /exit and /start exits ask mode — handled earlier in dispatch. Anything else is a question.
    record = _fetch_record_by_id(record_id)
    if not record:
        _ASK_MODE.pop(chat_id, None)
        await telegram_service.send_message(chat_id, "That transcript is gone. /start to reset.")
        return

    transcript_text = (record.get("transcript") or "").strip()
    summary_text = (record.get("summary") or "").strip()
    if not transcript_text:
        _ASK_MODE.pop(chat_id, None)
        await telegram_service.send_message(chat_id, "No transcript text available to answer questions about.")
        return

    await telegram_service.send_chat_action(chat_id, "typing")
    try:
        answer = chat_with_audio(
            transcript=transcript_text,
            summary=summary_text,
            history=[],  # Telegram ask-mode is single-turn for now
            question=question,
        )
    except Exception:
        logger.exception("[Telegram] chat_with_audio failed")
        await telegram_service.send_message(
            chat_id,
            "Couldn't get an answer right now. Try again in a minute.",
        )
        return

    await telegram_service.send_message(chat_id, answer or "(no answer)")


# ---------------------------------------------------------------------------
# Action: Calendar export (.ics)
# ---------------------------------------------------------------------------

async def _action_calendar(chat_id: int, record_id: str) -> None:
    items = actions_service.list_action_items_for_transcript(record_id)
    dated_items = [item for item in items if item.get("due_date")]
    if not dated_items:
        await telegram_service.send_message(chat_id, "No dated tasks to add to calendar.")
        return

    record = _fetch_record_by_id(record_id)
    audio_name = (record.get("audio_name") if record else None) or "transcript"

    try:
        ics_bytes = telegram_service.build_ics(audio_name, dated_items)
    except Exception:
        logger.exception("[Telegram] build_ics failed for record %s", record_id)
        await telegram_service.send_message(chat_id, "Couldn't build the calendar file. Try again later.")
        return

    safe_base = audio_name.replace("telegram:", "")
    safe_base = "".join(ch if ch.isalnum() or ch in "._- " else "_" for ch in safe_base).strip() or "tasks"
    await telegram_service.send_document(
        chat_id,
        ics_bytes,
        f"{safe_base}.ics",
        caption=f"📅 {len(dated_items)} dated task(s) — import into your calendar.",
    )


# ---------------------------------------------------------------------------
# Action: bulk mark all action items for a transcript done / dismissed
# ---------------------------------------------------------------------------

async def _action_mark_all(
    chat_id: int,
    record_id: str,
    message_id: Optional[int],
    new_status: str,
) -> None:
    updated = actions_service.mark_transcript_actions_status(record_id, new_status)
    if new_status == "done":
        if updated:
            footer = f"✅ All tasks marked done. ({updated})"
        else:
            footer = "✅ Tasks marked done."
    else:
        if updated:
            footer = f"❌ Dismissed. ({updated})"
        else:
            footer = "❌ Dismissed."
    await telegram_service.send_message(chat_id, footer)


# ---------------------------------------------------------------------------
# /tasks /pending /completed
# ---------------------------------------------------------------------------

async def _send_action_list(chat_id: int, status: str, header: str) -> None:
    user_id = _chat_user_id(chat_id)
    rows = actions_service.list_action_items(user_id, status=status, limit=25)
    if not rows:
        msg = "No pending tasks." if status == "pending" else "No completed tasks."
        await telegram_service.send_message(chat_id, msg)
        return

    lines = [header]
    for index, row in enumerate(rows, start=1):
        title = str(row.get("title") or "").strip() or "(untitled)"
        extras = []
        person = (row.get("person") or "").strip()
        if person:
            extras.append(person)
        due_date = (row.get("due_date") or "")
        due_time = (row.get("due_time") or "")
        if due_date and due_time:
            extras.append(f"{due_date} {due_time}")
        elif due_date:
            extras.append(str(due_date))
        suffix = f" — {', '.join(extras)}" if extras else ""
        # _html_escape lives in telegram_service; we re-import via the module path.
        title_esc = (
            title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        )
        suffix_esc = (
            suffix.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        )
        lines.append(f"{index}. {title_esc}{suffix_esc}")
    await telegram_service.send_message(chat_id, "\n".join(lines))


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def _fetch_record_by_id(record_id: str) -> Optional[dict]:
    """Read a single transcripts row by primary key id. We call Supabase
    directly through `supabase_service._client` indirectly via the existing
    `get_transcript_by_job` style helper, but the existing service doesn't
    expose lookup by id, so we use the underlying client here."""
    try:
        from services.supabase_service import _client  # type: ignore[attr-defined]
        response = (
            _client.table("transcripts")
            .select("*")
            .eq("id", record_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        if not rows:
            return None
        row = dict(rows[0])
        # key_points is stored as JSON-encoded text
        if isinstance(row.get("key_points"), str):
            try:
                row["key_points"] = json.loads(row["key_points"])
            except Exception:
                row["key_points"] = []
        return row
    except Exception as exc:
        logger.warning("[Telegram] _fetch_record_by_id failed for %s: %s", record_id, exc)
        return None


# ---------------------------------------------------------------------------
# Admin helper: register the webhook with Telegram in one click
# ---------------------------------------------------------------------------

@router.get("/set-webhook")
async def set_webhook(url: str) -> dict:
    if not telegram_service.is_configured():
        raise HTTPException(status_code=503, detail="Telegram bot not configured.")
    if not url.startswith("https://"):
        raise HTTPException(status_code=400, detail="Webhook URL must be https.")
    try:
        result = await telegram_service.set_webhook(url)
        return {"ok": True, "telegram_response": result}
    except Exception as exc:
        logger.exception("[Telegram] set_webhook failed")
        raise HTTPException(status_code=500, detail=f"setWebhook failed: {exc}")
