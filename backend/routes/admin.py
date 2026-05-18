from fastapi import APIRouter, Header, HTTPException, Body
from typing import Optional
from services import admin_service
from services import analytics_service

router = APIRouter(prefix="/admin", tags=["admin"])


def _admin_id(authorization: Optional[str]) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token.")
    token = authorization.split(" ", 1)[1].strip()
    try:
        return admin_service.verify_admin(token)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc))


@router.get("/check")
def admin_check(authorization: Optional[str] = Header(None)):
    user_id = _admin_id(authorization)
    return {"is_admin": True, "user_id": user_id}


@router.get("/overview")
def overview(authorization: Optional[str] = Header(None)):
    _admin_id(authorization)
    return admin_service.get_overview()


@router.get("/users")
def list_users(
    search: str = "",
    plan: str = "",
    status: str = "",
    authorization: Optional[str] = Header(None),
):
    _admin_id(authorization)
    return {"users": admin_service.list_users(search=search, plan=plan, status=status)}


@router.get("/users/{user_id}")
def get_user(user_id: str, authorization: Optional[str] = Header(None)):
    _admin_id(authorization)
    try:
        return admin_service.get_user_detail(user_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/users/{user_id}/credits")
def adjust_credits(
    user_id: str,
    payload: dict = Body(...),
    authorization: Optional[str] = Header(None),
):
    _admin_id(authorization)
    mode = payload.get("mode")
    amount = int(payload.get("amount") or 0)
    try:
        return admin_service.adjust_credits(user_id, mode=mode, amount=amount)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/users/{user_id}/suspend")
def suspend(user_id: str, authorization: Optional[str] = Header(None)):
    _admin_id(authorization)
    return admin_service.set_suspended(user_id, True)


@router.post("/users/{user_id}/unsuspend")
def unsuspend(user_id: str, authorization: Optional[str] = Header(None)):
    _admin_id(authorization)
    return admin_service.set_suspended(user_id, False)


@router.delete("/users/{user_id}")
def delete_user(user_id: str, authorization: Optional[str] = Header(None)):
    _admin_id(authorization)
    admin_service.delete_user(user_id)
    return {"ok": True}


@router.get("/failed-jobs")
def failed_jobs(authorization: Optional[str] = Header(None)):
    _admin_id(authorization)
    return {"jobs": admin_service.list_failed_jobs()}


@router.delete("/failed-jobs/{job_id}")
def delete_failed(job_id: str, authorization: Optional[str] = Header(None)):
    _admin_id(authorization)
    admin_service.delete_failed_job(job_id)
    return {"ok": True}


@router.post("/failed-jobs/{job_id}/retry")
def retry_failed(job_id: str, authorization: Optional[str] = Header(None)):
    _admin_id(authorization)
    # Retry requires original audio which the system does not persist.
    # Surface a clear 501 so the frontend can show "retry unavailable" rather than fake success.
    raise HTTPException(status_code=501, detail="Retry unavailable: original audio is not persisted.")


@router.get("/settings")
def get_settings(authorization: Optional[str] = Header(None)):
    _admin_id(authorization)
    return admin_service.get_settings()


@router.put("/settings/{key}")
def update_setting(
    key: str,
    payload: dict = Body(...),
    authorization: Optional[str] = Header(None),
):
    _admin_id(authorization)
    return admin_service.update_setting(key, payload.get("value"))


@router.get("/api-monitoring")
def api_monitoring(authorization: Optional[str] = Header(None)):
    _admin_id(authorization)
    return admin_service.get_api_monitoring()


@router.get("/analytics")
def analytics(authorization: Optional[str] = Header(None)):
    _admin_id(authorization)
    return admin_service.get_analytics()


@router.post("/analytics/backfill")
def analytics_backfill(
    payload: dict = Body(default={}),
    authorization: Optional[str] = Header(None),
):
    """Copy every existing transcripts row into analytics_events.

    POST body: {"force": true} to re-run even when analytics_events already
    has rows (existing transcript_ids are skipped, so it's idempotent).
    """
    _admin_id(authorization)
    force = bool((payload or {}).get("force"))
    try:
        return analytics_service.backfill_from_transcripts(force=force)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Backfill failed: {exc}")


@router.get("/diag")
def diag(authorization: Optional[str] = Header(None)):
    """Diagnostic endpoint — reports env config and table health without touching existing logic."""
    _admin_id(authorization)
    return admin_service.get_diagnostics()
