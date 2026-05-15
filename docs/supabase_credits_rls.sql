-- Enable RLS on user_credits and add per-user policies.
-- Run this AFTER supabase_credits_migration.sql.
-- The Supabase JS client sends a JWT for authenticated users; auth.uid() returns the user's UUID.

ALTER TABLE user_credits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_credits" ON user_credits;
CREATE POLICY "users_read_own_credits"
  ON user_credits
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_insert_own_credits" ON user_credits;
CREATE POLICY "users_insert_own_credits"
  ON user_credits
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "users_update_own_credits" ON user_credits;
CREATE POLICY "users_update_own_credits"
  ON user_credits
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
