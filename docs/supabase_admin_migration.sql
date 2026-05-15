-- Admin Panel migration. Run AFTER supabase_processing_migration.sql, supabase_credits_migration.sql,
-- and supabase_credits_rls.sql. Run inside the Supabase SQL editor.

-- 1. Admin whitelist
CREATE TABLE IF NOT EXISTS admin_users (
  user_id UUID PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_admin_users" ON admin_users;
CREATE POLICY "admins_read_admin_users"
  ON admin_users
  FOR SELECT
  TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

-- 2. Global app settings (single-row pattern keyed by name)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_app_settings" ON app_settings;
CREATE POLICY "admins_read_app_settings"
  ON app_settings
  FOR SELECT
  TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

DROP POLICY IF EXISTS "admins_write_app_settings" ON app_settings;
CREATE POLICY "admins_write_app_settings"
  ON app_settings
  FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

-- Seed default settings
INSERT INTO app_settings (key, value) VALUES
  ('default_credits', '100'::jsonb),
  ('credits_per_minute', '2'::jsonb),
  ('daily_reset', 'true'::jsonb),
  ('max_upload_mb', '25'::jsonb),
  ('max_audio_minutes', '120'::jsonb),
  ('fallback_order', '["assemblyai", "groq_whisper"]'::jsonb),
  ('assemblyai_enabled', 'true'::jsonb),
  ('groq_fallback_enabled', 'true'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 3. Suspension flag on user_credits (single source of truth for user account state)
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS suspended BOOLEAN DEFAULT FALSE;
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMP WITH TIME ZONE DEFAULT now();
ALTER TABLE user_credits ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- 4. Error category on transcripts (lets failed-job center filter / group)
ALTER TABLE transcripts ADD COLUMN IF NOT EXISTS error_category TEXT;

-- 5. Admin-side read policies for user_credits and transcripts (so admin views can read everyone's rows)
DROP POLICY IF EXISTS "admins_read_all_user_credits" ON user_credits;
CREATE POLICY "admins_read_all_user_credits"
  ON user_credits
  FOR SELECT
  TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

DROP POLICY IF EXISTS "admins_update_all_user_credits" ON user_credits;
CREATE POLICY "admins_update_all_user_credits"
  ON user_credits
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admin_users));

DROP POLICY IF EXISTS "admins_delete_all_user_credits" ON user_credits;
CREATE POLICY "admins_delete_all_user_credits"
  ON user_credits
  FOR DELETE
  TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admin_users));

-- transcripts table currently has RLS disabled. Leaving it alone here so existing
-- compare/merge/history flows do not regress. Admin reads/writes against transcripts
-- go through the backend admin endpoints which use the Supabase service-role key.
