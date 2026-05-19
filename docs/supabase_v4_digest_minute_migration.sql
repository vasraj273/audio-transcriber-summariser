-- V4.1 — Add minute-precision to digest scheduling.
-- Safe to re-run.

ALTER TABLE telegram_chat_prefs
  ADD COLUMN IF NOT EXISTS digest_minute SMALLINT NOT NULL DEFAULT 0;
