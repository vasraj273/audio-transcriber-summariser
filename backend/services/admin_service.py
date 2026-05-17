import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_SUPABASE_URL = os.getenv("SUPABASE_URL")
_SUPABASE_KEY = os.getenv("SUPABASE_KEY")
_SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not _SUPABASE_URL or not _SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_KEY must be set for admin_service.")

# Auth client uses the anon key — only used to validate the user's JWT via auth.get_user.
_auth_client: Client = create_client(_SUPABASE_URL, _SUPABASE_KEY)

# Data client should use the service-role key so admin reads/writes bypass RLS.
# Fall back to the anon key with a warning if no service role is configured — admin queries
# will then be subject to RLS and likely fail until SUPABASE_SERVICE_ROLE_KEY is set.
if _SUPABASE_SERVICE_ROLE_KEY:
    _client: Client = create_client(_SUPABASE_URL, _SUPABASE_SERVICE_ROLE_KEY)
    logger.info("admin_service initialised with service-role key.")
else:
    _client = _auth_client
    logger.warning(
        "SUPABASE_SERVICE_ROLE_KEY is not set. admin_service is using the anon key — RLS policies will block admin lookups. "
        "Set the service-role key in backend/.env and on Render."
    )


def verify_admin(jwt_token: str) -> str:
    if not jwt_token:
        raise PermissionError("Missing auth token.")
    try:
        user_response = _auth_client.auth.get_user(jwt_token)
    except Exception as exc:
        logger.warning("Admin auth: get_user failed: %s", exc)
        raise PermissionError("Invalid auth token.") from exc

    user = getattr(user_response, "user", None)
    user_id = getattr(user, "id", None) if user else None
    if not user_id:
        logger.warning("Admin auth: token decoded but no user id present.")
        raise PermissionError("Invalid auth token (no user).")

    logger.info("Admin auth: looking up user_id=%s in admin_users.", user_id)

    response = (
        _client.table("admin_users")
        .select("user_id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    is_admin = len(rows) > 0

    logger.info(
        "Admin auth: lookup complete. user_id=%s is_admin=%s rows=%d",
        user_id,
        is_admin,
        len(rows),
    )

    if not is_admin:
        raise PermissionError("Caller is not an admin.")
    return user_id


def get_overview() -> dict:
    empty = {
        "total_users": 0,
        "active_users_today": 0,
        "new_users_this_week": 0,
        "total_transcripts": 0,
        "completed_transcripts": 0,
        "failed_jobs": 0,
        "total_audio_minutes": 0,
        "total_credits_consumed": 0,
        "estimated_api_usage": 0,
    }
    try:
        transcripts = _client.table("transcripts").select("id, status, duration_seconds, credits_used, user_id, created_at, error_category").execute().data or []
        credits = _client.table("user_credits").select("user_id, used_credits, total_credits, suspended, last_active_at, first_login_at, created_at").execute().data or []

        now = datetime.now(timezone.utc)
        today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        week_start = now - timedelta(days=7)

        completed = [t for t in transcripts if (t.get("status") or "completed") == "completed"]
        failed = [t for t in transcripts if t.get("status") == "failed"]
        total_minutes = sum((t.get("duration_seconds") or 0) for t in completed) / 60.0
        total_credits_consumed = sum((c.get("used_credits") or 0) for c in credits) + sum((t.get("credits_used") or 0) for t in completed)

        new_users_this_week = sum(
            1 for c in credits
            if c.get("first_login_at") and _safe_parse(c.get("first_login_at")) and _safe_parse(c.get("first_login_at")) >= week_start
        )
        active_today = sum(
            1 for c in credits
            if c.get("last_active_at") and _safe_parse(c.get("last_active_at")) and _safe_parse(c.get("last_active_at")) >= today_start
        )

        return {
            "total_users": len(credits),
            "active_users_today": active_today,
            "new_users_this_week": new_users_this_week,
            "total_transcripts": len(transcripts),
            "completed_transcripts": len(completed),
            "failed_jobs": len(failed),
            "total_audio_minutes": round(total_minutes, 1),
            "total_credits_consumed": int(total_credits_consumed),
            "estimated_api_usage": round(total_minutes, 1),
        }
    except Exception as exc:
        logger.exception("get_overview failed: %s", exc)
        return empty


def list_users(search: str = "", plan: str = "", status: str = "") -> list:
    try:
        credits = _client.table("user_credits").select("*").execute().data or []
        transcripts = _client.table("transcripts").select("user_id, status, duration_seconds, credits_used").execute().data or []

        transcripts_by_user = {}
        for record in transcripts:
            uid = record.get("user_id")
            if not uid:
                continue
            bucket = transcripts_by_user.setdefault(uid, {"total": 0, "completed": 0, "failed": 0, "minutes": 0.0})
            bucket["total"] += 1
            if record.get("status") == "failed":
                bucket["failed"] += 1
            else:
                bucket["completed"] += 1
                bucket["minutes"] += (record.get("duration_seconds") or 0) / 60.0

        rows = []
        for row in credits:
            uid = row.get("user_id")
            stats = transcripts_by_user.get(uid, {"total": 0, "completed": 0, "failed": 0, "minutes": 0.0})
            rows.append({
                "user_id": uid,
                "email": _safe_email(uid),
                "plan": row.get("plan") or "free",
                "total_credits": row.get("total_credits") or 0,
                "used_credits": row.get("used_credits") or 0,
                "remaining_credits": max(0, (row.get("total_credits") or 0) - (row.get("used_credits") or 0)),
                "suspended": bool(row.get("suspended")),
                "status": "suspended" if row.get("suspended") else "active",
                "first_login_at": row.get("first_login_at") or row.get("created_at"),
                "last_active_at": row.get("last_active_at"),
                "transcripts_total": stats["total"],
                "transcripts_completed": stats["completed"],
                "transcripts_failed": stats["failed"],
                "audio_minutes": round(stats["minutes"], 1),
            })

        if search:
            needle = search.lower()
            rows = [r for r in rows if needle in (r["email"] or "").lower() or needle in (r["user_id"] or "").lower()]
        if plan:
            rows = [r for r in rows if r["plan"] == plan]
        if status:
            rows = [r for r in rows if r["status"] == status]
        return rows
    except Exception as exc:
        logger.exception("list_users failed: %s", exc)
        return []


def get_user_detail(user_id: str) -> dict:
    credits_resp = _client.table("user_credits").select("*").eq("user_id", user_id).limit(1).execute()
    rows = credits_resp.data or []
    credits_row = rows[0] if rows else None
    if not credits_row:
        raise ValueError("User not found.")

    transcripts = _client.table("transcripts").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(20).execute().data or []
    completed = [t for t in transcripts if (t.get("status") or "completed") == "completed"]
    failed = [t for t in transcripts if t.get("status") == "failed"]

    total_minutes = sum((t.get("duration_seconds") or 0) for t in completed) / 60.0
    avg_length = (sum(len((t.get("transcript") or "")) for t in completed) / len(completed)) if completed else 0

    return {
        "user_id": user_id,
        "email": _safe_email(user_id),
        "plan": credits_row.get("plan") or "free",
        "total_credits": credits_row.get("total_credits") or 0,
        "used_credits": credits_row.get("used_credits") or 0,
        "remaining_credits": max(0, (credits_row.get("total_credits") or 0) - (credits_row.get("used_credits") or 0)),
        "suspended": bool(credits_row.get("suspended")),
        "status": "suspended" if credits_row.get("suspended") else "active",
        "created_at": credits_row.get("created_at"),
        "first_login_at": credits_row.get("first_login_at") or credits_row.get("created_at"),
        "last_active_at": credits_row.get("last_active_at"),
        "transcripts_total": len(transcripts),
        "transcripts_completed": len(completed),
        "transcripts_failed": len(failed),
        "audio_minutes": round(total_minutes, 1),
        "average_transcript_length": int(avg_length),
        "recent_activity": [
            {
                "id": t.get("id"),
                "audio_name": t.get("audio_name"),
                "status": t.get("status"),
                "created_at": t.get("created_at"),
                "duration_seconds": t.get("duration_seconds"),
                "credits_used": t.get("credits_used"),
                "error_message": t.get("error_message"),
            }
            for t in transcripts[:10]
        ],
    }


def adjust_credits(user_id: str, mode: str, amount: int) -> dict:
    current = _client.table("user_credits").select("total_credits, used_credits").eq("user_id", user_id).limit(1).execute().data
    if not current:
        raise ValueError("User not found.")
    row = current[0]
    total = row.get("total_credits") or 0
    used = row.get("used_credits") or 0

    if mode == "add":
        # "Add credits" means give the user more remaining credits without raising
        # their plan cap. Implement by reducing used_credits, floored at 0.
        new_used = max(0, used - max(0, int(amount)))
        update = {"used_credits": new_used}
    elif mode == "reset":
        update = {"used_credits": 0, "last_reset_at": datetime.now(timezone.utc).isoformat()}
    elif mode == "set_total":
        # Admin override of the plan cap. Clamp used so it doesn't exceed total.
        new_total = max(0, int(amount))
        new_used = min(used, new_total)
        update = {"total_credits": new_total, "used_credits": new_used}
    else:
        raise ValueError("Unsupported credit adjustment mode.")

    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    response = _client.table("user_credits").update(update).eq("user_id", user_id).execute()
    return (response.data or [{}])[0]


def set_suspended(user_id: str, suspended: bool) -> dict:
    response = _client.table("user_credits").update({
        "suspended": suspended,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("user_id", user_id).execute()
    return (response.data or [{}])[0]


def delete_user(user_id: str) -> None:
    _client.table("transcripts").delete().eq("user_id", user_id).execute()
    _client.table("user_credits").delete().eq("user_id", user_id).execute()


def list_failed_jobs(limit: int = 100) -> list:
    rows = _client.table("transcripts").select("id, user_id, audio_name, created_at, error_message, error_category, status").eq("status", "failed").order("created_at", desc=True).limit(limit).execute().data or []
    for row in rows:
        row["error_category"] = row.get("error_category") or _categorize(row.get("error_message") or "")
        row["email"] = _safe_email(row.get("user_id") or "")
    return rows


def delete_failed_job(job_record_id: str) -> None:
    _client.table("transcripts").delete().eq("id", job_record_id).execute()


def get_settings() -> dict:
    rows = _client.table("app_settings").select("key, value").execute().data or []
    return {row["key"]: row["value"] for row in rows}


def update_setting(key: str, value) -> dict:
    payload = {"key": key, "value": value, "updated_at": datetime.now(timezone.utc).isoformat()}
    response = _client.table("app_settings").upsert(payload, on_conflict="key").execute()
    return (response.data or [{}])[0]


def get_api_monitoring() -> dict:
    empty = {
        "groq": {"requests_today": 0, "failures_today": 0, "rate_limit_hits": 0, "status": "healthy"},
        "assemblyai": {"processed_minutes": 0, "requests_today": 0, "failures_today": 0, "status": "healthy"},
    }
    try:
        return _get_api_monitoring_inner(empty)
    except Exception as exc:
        print(f"[Monitoring] get_api_monitoring fatal: {exc}")
        logger.exception("[Monitoring] get_api_monitoring fatal: %s", exc)
        return empty


def _get_api_monitoring_inner(empty: dict) -> dict:
    now = datetime.now(timezone.utc)
    day_ago = now - timedelta(hours=24)

    try:
        usage = _client.table("api_usage_events").select(
            "provider, success, rate_limited, duration_seconds, created_at"
        ).gte("created_at", day_ago.isoformat()).execute().data or []
        logger.info("[Monitoring] api_usage_events 24h rows=%d", len(usage))
    except Exception as exc:
        logger.exception("[Monitoring] api_usage_events read failed: %s", exc)
        usage = []

    if usage:
        def _aggregate(rows: list, providers: tuple) -> dict:
            scoped = [r for r in rows if r.get("provider") in providers]
            failures = [r for r in scoped if not r.get("success")]
            rate_limit_hits = sum(1 for r in scoped if r.get("rate_limited"))
            processed_minutes = round(
                sum((r.get("duration_seconds") or 0) for r in scoped if r.get("success")) / 60.0,
                1,
            )
            return {
                "requests_today": len(scoped),
                "failures_today": len(failures),
                "rate_limit_hits": rate_limit_hits,
                "processed_minutes": processed_minutes,
                "status": _health(rate_limit_hits, len(failures)),
            }

        return {
            "groq": _aggregate(usage, ("groq_llama", "groq_whisper")),
            "assemblyai": _aggregate(usage, ("assemblyai",)),
        }

    # Fallback path used while api_usage_events is still empty (migration not run,
    # or no requests since deploy). Approximate from transcripts.
    try:
        transcripts = _client.table("transcripts").select(
            "status, error_category, error_message, created_at, duration_seconds, transcription_provider"
        ).execute().data or []
        last_24h = [t for t in transcripts if _safe_parse(t.get("created_at")) and _safe_parse(t.get("created_at")) >= day_ago]
        failed = [t for t in last_24h if t.get("status") == "failed"]
        rate_limit_hits = sum(
            1 for t in failed
            if "rate" in (t.get("error_message") or "").lower() or t.get("error_category") == "rate_limit"
        )
        processed_minutes = round(
            sum((t.get("duration_seconds") or 0) for t in last_24h if t.get("status") == "completed") / 60.0,
            1,
        )
        logger.info(
            "[Monitoring] fallback derived from transcripts 24h rows=%d failed=%d",
            len(last_24h), len(failed),
        )
        return {
            "groq": {
                "requests_today": len(last_24h),
                "failures_today": len(failed),
                "rate_limit_hits": rate_limit_hits,
                "status": _health(rate_limit_hits, len(failed)),
            },
            "assemblyai": {
                "processed_minutes": processed_minutes,
                "requests_today": len(last_24h),
                "failures_today": len(failed),
                "status": _health(0, len(failed)),
            },
        }
    except Exception as exc:
        logger.exception("get_api_monitoring fallback failed: %s", exc)
        return empty


def get_analytics() -> dict:
    empty = {"daily": [], "languages": [], "audio_types": [], "providers": []}
    try:
        return _get_analytics_inner(empty)
    except Exception as exc:
        print(f"[Analytics] get_analytics fatal: {exc}")
        logger.exception("[Analytics] get_analytics fatal: %s", exc)
        return empty


def _get_analytics_inner(empty: dict) -> dict:
    # Source-of-truth: analytics_events. Fallback to transcripts only when the
    # events table is empty (migration not run, or no jobs since deploy).
    events = []
    try:
        events = _client.table("analytics_events").select(
            "user_id, created_at, duration_seconds, language, audio_type, "
            "provider_used, credits_used, transcript_status"
        ).execute().data or []
        logger.info("[Analytics] analytics_events rows=%d", len(events))
    except Exception as exc:
        logger.warning("[Analytics] analytics_events read failed (%s) - falling back to transcripts.", exc)

    if not events:
        try:
            transcripts = _client.table("transcripts").select(
                "detected_language, audio_type, created_at, duration_seconds, status, credits_used, transcription_provider, user_id"
            ).execute().data or []
            events = [
                {
                    "user_id": t.get("user_id"),
                    "created_at": t.get("created_at"),
                    "duration_seconds": t.get("duration_seconds") or 0,
                    "language": t.get("detected_language") or "unknown",
                    "audio_type": t.get("audio_type") or "unknown",
                    "provider_used": t.get("transcription_provider") or "unknown",
                    "credits_used": t.get("credits_used") or 0,
                    "transcript_status": t.get("status") or "completed",
                }
                for t in transcripts
            ]
            logger.info("[Analytics] fallback transcripts rows=%d", len(transcripts))
        except Exception as exc:
            logger.exception("[Analytics] both analytics_events + transcripts reads failed: %s", exc)
            return empty

    try:
        credits = _client.table("user_credits").select("last_active_at, first_login_at, user_id").execute().data or []
    except Exception as exc:
        logger.warning("[Analytics] user_credits read failed: %s", exc)
        credits = []

    now = datetime.now(timezone.utc)
    days = []
    for offset in range(13, -1, -1):
        day = now - timedelta(days=offset)
        day_start = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)
        day_end = day_start + timedelta(days=1)
        bucket = {
            "date": day_start.date().isoformat(),
            "uploads": 0,
            "minutes": 0.0,
            "credits_used": 0,
            "active_users": 0,
        }
        user_set = set()
        for e in events:
            ts = _safe_parse(e.get("created_at"))
            if ts and day_start <= ts < day_end:
                bucket["uploads"] += 1
                bucket["minutes"] += (e.get("duration_seconds") or 0) / 60.0
                bucket["credits_used"] += e.get("credits_used") or 0
        for c in credits:
            ts = _safe_parse(c.get("last_active_at"))
            if ts and day_start <= ts < day_end:
                user_set.add(c.get("user_id") or c.get("last_active_at"))
        bucket["active_users"] = len(user_set)
        bucket["minutes"] = round(bucket["minutes"], 1)
        days.append(bucket)

    languages = {}
    audio_types = {}
    providers = {}
    for e in events:
        lang = e.get("language") or "unknown"
        languages[lang] = languages.get(lang, 0) + 1
        atype = e.get("audio_type") or "unknown"
        audio_types[atype] = audio_types.get(atype, 0) + 1
        prov = e.get("provider_used") or "unknown"
        providers[prov] = providers.get(prov, 0) + 1

    logger.info(
        "[Analytics] aggregated: events=%d languages=%d providers=%d",
        len(events), len(languages), len(providers),
    )

    return {
        "daily": days,
        "languages": [{"label": k, "count": v} for k, v in sorted(languages.items(), key=lambda x: -x[1])[:8]],
        "audio_types": [{"label": k, "count": v} for k, v in sorted(audio_types.items(), key=lambda x: -x[1])[:8]],
        "providers": [{"label": k, "count": v} for k, v in sorted(providers.items(), key=lambda x: -x[1])],
    }


def _safe_email(user_id: str) -> str:
    if not user_id:
        return ""
    try:
        response = _client.auth.admin.get_user_by_id(user_id)
        user = getattr(response, "user", None) or response
        email = getattr(user, "email", None)
        return email or ""
    except Exception:
        return ""


def _safe_parse(value) -> Optional[datetime]:
    if not value:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        if isinstance(value, str):
            if value.endswith("Z"):
                value = value[:-1] + "+00:00"
            return datetime.fromisoformat(value)
    except ValueError:
        return None
    return None


def _categorize(message: str) -> str:
    text = (message or "").lower()
    if "rate limit" in text or "429" in text or "tokens per day" in text:
        return "rate_limit"
    if "assemblyai" in text:
        return "transcription_failure"
    if "unsupported" in text or "audio" in text and "format" in text:
        return "audio_unsupported"
    if "credit" in text:
        return "credit_issue"
    if "network" in text or "fetch" in text or "timeout" in text:
        return "network"
    return "other"


def _health(rate_limit_hits: int, total_failures: int) -> str:
    if rate_limit_hits >= 5 or total_failures >= 20:
        return "error"
    if rate_limit_hits >= 1 or total_failures >= 5:
        return "warning"
    return "healthy"
