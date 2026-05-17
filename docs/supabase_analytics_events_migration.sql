-- Dedicated analytics + monitoring tables. Run AFTER supabase_analytics_migration.sql.
-- These tables receive an INSERT for every transcript-save and every external AI call,
-- so the admin Analytics + API Monitoring panels can render real data instead of
-- deriving everything from the live `transcripts` table.
--
-- RLS is left DISABLED because admin reads go through the service-role key and the
-- backend is the only writer. Frontend never touches these tables.

CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id UUID,
  job_id TEXT,
  user_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  duration_seconds NUMERIC DEFAULT 0,
  language TEXT,
  audio_type TEXT,
  provider_used TEXT,
  credits_used INTEGER DEFAULT 0,
  processing_ms INTEGER,
  transcript_status TEXT,
  error_message TEXT
);

ALTER TABLE analytics_events DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS analytics_events_created_at_idx ON analytics_events(created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_user_id_idx ON analytics_events(user_id);
CREATE INDEX IF NOT EXISTS analytics_events_provider_idx ON analytics_events(provider_used);
CREATE INDEX IF NOT EXISTS analytics_events_transcript_id_idx ON analytics_events(transcript_id);


CREATE TABLE IF NOT EXISTS api_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,           -- 'assemblyai' | 'groq_whisper' | 'groq_llama'
  endpoint TEXT,                    -- 'transcribe' | 'chat_completion' | 'summarise' | etc.
  created_at TIMESTAMPTZ DEFAULT now(),
  success BOOLEAN DEFAULT TRUE,
  rate_limited BOOLEAN DEFAULT FALSE,
  duration_seconds NUMERIC DEFAULT 0,   -- audio minutes processed (transcription) or 0
  latency_ms INTEGER,
  error_message TEXT
);

ALTER TABLE api_usage_events DISABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS api_usage_events_created_at_idx ON api_usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS api_usage_events_provider_idx ON api_usage_events(provider);
