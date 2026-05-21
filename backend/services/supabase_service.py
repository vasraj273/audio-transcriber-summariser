import json
import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

_client: Client = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY"),
)


def create_processing_transcript(
    *,
    job_id: str,
    user_id: str,
    audio_name: str,
    options: dict,
) -> str:
    payload = {
        "job_id": job_id,
        "user_id": user_id,
        "audio_name": audio_name,
        "status": "queued",
        "transcript": "",
        "summary": "Processing audio...",
        "key_points": json.dumps([]),
        "output_language": options.get("output_language"),
        "focus": options.get("summary_focus"),
        "format": options.get("summary_format"),
        "summary_length": options.get("summary_length"),
    }
    response = _client.table("transcripts").insert(payload).execute()
    data = response.data or []
    return data[0].get("id", "") if data else ""


def mark_transcript_processing(job_id: str) -> None:
    _update_by_job(job_id, {"status": "processing"})


def complete_transcript(job_id: str, result: dict) -> None:
    payload = {
        "status": "completed",
        "transcript": result.get("transcript", ""),
        "summary": result.get("summary", ""),
        "key_points": json.dumps(result.get("key_points", [])),
        "detected_language": result.get("detected_language", ""),
        "speaker_transcript": result.get("speaker_transcript", ""),
        "speaker_count": result.get("speaker_count", 1),
        "audio_type": result.get("audio_type", ""),
        "quality_score": result.get("quality_score", 0),
        "quality_flags": json.dumps(result.get("quality_flags", [])),
        "duration_seconds": result.get("duration_seconds", 0),
        "transcript_segments": json.dumps(result.get("transcript_segments", [])),
        "error_message": result.get("warning", ""),
        "transcription_provider": result.get("transcription_provider") or "unknown",
        "processing_ms": result.get("processing_ms"),
    }
    try:
        _update_by_job(job_id, payload)
    except Exception:
        # Fallback for environments where supabase_analytics_migration.sql has not been run yet.
        payload.pop("transcription_provider", None)
        payload.pop("processing_ms", None)
        _update_by_job(job_id, payload)
    print(f"[Analytics] record updated job_id={job_id} provider={payload.get('transcription_provider')}")


_TOUCH_ACTIVE_THROTTLE_SECONDS = 15 * 60


def touch_user_active(user_id: str) -> None:
    """Stamp `user_credits.last_active_at = now` for the given user.

    Throttled: skips the write if the existing timestamp is within
    `_TOUCH_ACTIVE_THROTTLE_SECONDS` to avoid DB spam on every request.
    No-op when no `user_credits` row exists for the user (e.g. Telegram
    synthetic users) — caller does not need to guard.
    """
    if not user_id:
        return
    try:
        from datetime import datetime, timedelta, timezone

        now = datetime.now(timezone.utc)
        existing = (
            _client.table("user_credits")
            .select("last_active_at")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
            .data
            or []
        )
        if not existing:
            return
        last_raw = existing[0].get("last_active_at")
        if last_raw:
            try:
                last_dt = datetime.fromisoformat(str(last_raw).replace("Z", "+00:00"))
                if last_dt.tzinfo is None:
                    last_dt = last_dt.replace(tzinfo=timezone.utc)
                if (now - last_dt) < timedelta(seconds=_TOUCH_ACTIVE_THROTTLE_SECONDS):
                    return
            except Exception:
                pass
        _client.table("user_credits").update(
            {"last_active_at": now.isoformat()}
        ).eq("user_id", user_id).execute()
        print(f"[Monitoring] last_active_at updated user_id={user_id}")
    except Exception as exc:
        print(f"[Monitoring] touch_user_active failed: {exc}")


def fail_transcript(job_id: str, error_message: str) -> None:
    _update_by_job(job_id, {
        "status": "failed",
        "summary": "Processing failed.",
        "error_message": error_message,
    })


def get_transcript_by_job(job_id: str) -> dict:
    response = (
        _client.table("transcripts")
        .select("*")
        .eq("job_id", job_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return _normalise_record(rows[0]) if rows else {}


def get_history(user_id: str) -> list:
    response = (
        _client.table("transcripts")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return [_normalise_record(record) for record in (response.data or [])]


def _update_by_job(job_id: str, payload: dict) -> None:
    _client.table("transcripts").update(payload).eq("job_id", job_id).execute()


def _normalise_record(record: dict) -> dict:
    normalised = dict(record)
    normalised["key_points"] = _json_or_default(record.get("key_points"), [])
    normalised["quality_flags"] = _json_or_default(record.get("quality_flags"), [])
    normalised["transcript_segments"] = _json_or_default(record.get("transcript_segments"), [])
    normalised["status"] = record.get("status") or "completed"
    normalised["speaker_count"] = record.get("speaker_count") or 1
    normalised["quality_score"] = record.get("quality_score") or 0
    return normalised


def _json_or_default(value, default):
    if value in (None, ""):
        return default
    if isinstance(value, (list, dict)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return default
