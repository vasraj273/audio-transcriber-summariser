-- V4 — Daily Intelligence / AI Secretary layer.
-- Additive only. RLS disabled to match the rest of the schema.
-- Safe to re-run; everything uses IF NOT EXISTS.

-- Per-Telegram-chat preferences (timezone, digest opt-in).
CREATE TABLE IF NOT EXISTS telegram_chat_prefs (
  chat_id BIGINT PRIMARY KEY,
  user_id UUID NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  digest_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  digest_hour SMALLINT NOT NULL DEFAULT 20,  -- 0-23, user local hour
  last_digest_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Cached daily digest output (so /digest reuses the cron-generated one).
CREATE TABLE IF NOT EXISTS daily_digest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  digest_date DATE NOT NULL,
  summary TEXT NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, digest_date)
);
CREATE INDEX IF NOT EXISTS idx_daily_digest_user_date ON daily_digest(user_id, digest_date DESC);

-- Rolling 7-day topic stats (refreshed by digest run).
CREATE TABLE IF NOT EXISTS topic_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  topic TEXT NOT NULL,
  mentions INTEGER NOT NULL DEFAULT 1,
  window_start DATE NOT NULL,
  window_end DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_topic_stats_user_window ON topic_stats(user_id, window_end DESC);

-- Rolling 7-day people stats.
CREATE TABLE IF NOT EXISTS people_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  person TEXT NOT NULL,
  mentions INTEGER NOT NULL DEFAULT 1,
  window_start DATE NOT NULL,
  window_end DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_people_stats_user_window ON people_stats(user_id, window_end DESC);

-- Add priority column to action_items if not present.
ALTER TABLE action_items ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';

-- RLS off to match the rest of the schema.
ALTER TABLE telegram_chat_prefs DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_digest DISABLE ROW LEVEL SECURITY;
ALTER TABLE topic_stats DISABLE ROW LEVEL SECURITY;
ALTER TABLE people_stats DISABLE ROW LEVEL SECURITY;
