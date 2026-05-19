-- Action items extracted from transcripts by the AI Actions / Productivity layer.
-- Keep RLS DISABLED to match the rest of the repo (transcripts, user_credits, analytics_events).
-- Harden later with RLS + RPC if action items are ever consumed by the frontend with the anon key.

CREATE TABLE IF NOT EXISTS action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  transcript_id UUID REFERENCES transcripts(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  person TEXT,
  due_date DATE,
  due_time TIME,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_items_user_status ON action_items(user_id, status);
CREATE INDEX IF NOT EXISTS idx_action_items_transcript ON action_items(transcript_id);

ALTER TABLE action_items DISABLE ROW LEVEL SECURITY;
