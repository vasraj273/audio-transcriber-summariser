-- Adds provider tracking + processing time on transcripts so analytics + monitoring
-- can break down activity by engine. Run AFTER supabase_admin_rls_fix.sql.

ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS transcription_provider TEXT;
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS processing_ms INTEGER;
