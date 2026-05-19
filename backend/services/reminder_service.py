"""Reminder scheduling scaffold (future work).

This module sketches the API surface for the eventual reminder feature. NOTHING
in here actually schedules anything yet — there is no background loop, no DB
table, no cron entry. It exists so the rest of the codebase can `import` from
a stable path the day we wire reminders up for real.

PLANNED CRON ENTRYPOINT (future):
    A new HTTP route, e.g. `POST /cron/reminders`, will be added to
    `backend/main.py` (or a dedicated `routes/cron.py`). It will be hit by
    cron-job.org once a day (same external scheduler we already use for the
    Render keep-alive `/ping` endpoint).

    The handler will:
      1. Call `due_reminders(datetime.utcnow())` to read every reminder whose
         `due_at` is in the past and `delivered_at` is null.
      2. For each one, look up the action_item + user's Telegram chat_id and
         call `notify_due(...)`, which will eventually post a Telegram message
         via `services.telegram_service.send_message`.
      3. Mark the reminder as delivered so it does not fire twice.

    Persistence will live in a new Supabase table `reminders`:
        id UUID PRIMARY KEY,
        user_id UUID,
        action_id UUID REFERENCES action_items(id) ON DELETE CASCADE,
        due_at TIMESTAMPTZ,
        delivered_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ DEFAULT now()

    A migration file `docs/supabase_reminders_migration.sql` will accompany the
    real implementation.

For now everything below is a no-op stub. Calling it does not error, but also
does not schedule anything. The bot's request flow does NOT currently call
into this module — wiring happens later.
"""

import logging
import uuid
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)


def schedule_reminder(user_id: str, action_id: str, due_at: datetime) -> str:
    """Schedule a reminder for an action item. STUB ONLY — logs the request
    and returns a synthetic id. The eventual implementation will INSERT into
    a `reminders` Supabase table and let the cron entrypoint pick it up.

    Returns the (fake) reminder id so callers can store it for later cancel.
    """
    fake_id = str(uuid.uuid4())
    logger.info(
        "[Reminder] scaffold schedule_reminder user_id=%s action_id=%s due_at=%s -> fake_id=%s",
        user_id, action_id, due_at.isoformat() if due_at else None, fake_id,
    )
    return fake_id


def cancel_reminder(reminder_id: str) -> bool:
    """Cancel a previously scheduled reminder. STUB ONLY — always returns
    False because there is no underlying record yet."""
    logger.info("[Reminder] scaffold cancel_reminder reminder_id=%s (no-op)", reminder_id)
    return False


def due_reminders(now: Optional[datetime] = None) -> list[dict]:
    """Return every reminder whose `due_at <= now` and `delivered_at is null`.
    STUB ONLY — returns an empty list. The cron handler will be a thin loop
    over this list once the table exists."""
    _ = now or datetime.utcnow()
    return []


def notify_due(reminder: dict) -> None:
    """Deliver a single due reminder. STUB ONLY — placeholder for the future
    Telegram push (and later, email + web-push). The real implementation will:
      - Resolve `reminder["user_id"]` back to a Telegram chat_id (mapping table
        TBD — likely a new `telegram_users` table linking chat_id<->user_id).
      - Format a short reminder message including the action item title and
        due time.
      - Call `telegram_service.send_message(chat_id, text)`.
      - Stamp `reminders.delivered_at = now()` so it never fires twice.
    """
    logger.info("[Reminder] scaffold notify_due reminder=%s (no-op)", reminder)
