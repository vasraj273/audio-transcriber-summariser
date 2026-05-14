ALTER TABLE transcripts
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed',
ADD COLUMN IF NOT EXISTS job_id UUID,
ADD COLUMN IF NOT EXISTS error_message TEXT,
ADD COLUMN IF NOT EXISTS audio_type TEXT,
ADD COLUMN IF NOT EXISTS quality_score NUMERIC,
ADD COLUMN IF NOT EXISTS quality_flags TEXT,
ADD COLUMN IF NOT EXISTS duration_seconds NUMERIC,
ADD COLUMN IF NOT EXISTS transcript_segments TEXT,
ADD COLUMN IF NOT EXISTS speaker_transcript TEXT,
ADD COLUMN IF NOT EXISTS speaker_count INTEGER;

CREATE INDEX IF NOT EXISTS transcripts_job_id_idx ON transcripts(job_id);
CREATE INDEX IF NOT EXISTS transcripts_user_status_idx ON transcripts(user_id, status);

CREATE TABLE IF NOT EXISTS transcript_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  analysis_type TEXT,
  source_transcript_ids TEXT,
  title TEXT,
  result TEXT,
  created_at TIMESTAMP DEFAULT now()
);
