-- Fix infinite recursion in admin_users RLS policies.
-- Run this AFTER supabase_admin_migration.sql in the Supabase SQL editor.
-- Drops the recursive policies, replaces them with a SECURITY DEFINER helper
-- so admin checks no longer query admin_users from inside admin_users' own policy.

-- 1. Drop every recursive policy
DROP POLICY IF EXISTS "admins_read_admin_users" ON admin_users;
DROP POLICY IF EXISTS "admins_read_app_settings" ON app_settings;
DROP POLICY IF EXISTS "admins_write_app_settings" ON app_settings;
DROP POLICY IF EXISTS "admins_read_all_user_credits" ON user_credits;
DROP POLICY IF EXISTS "admins_update_all_user_credits" ON user_credits;
DROP POLICY IF EXISTS "admins_delete_all_user_credits" ON user_credits;

-- 2. SECURITY DEFINER helper. Runs as the function owner, so RLS on admin_users
-- does not apply inside the function body -> no recursion.
CREATE OR REPLACE FUNCTION public.is_admin(uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = uid);
$$;

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, anon;

-- 3. admin_users: let any authenticated user read only their own row.
-- The frontend uses this to detect "am I an admin" without recursion.
DROP POLICY IF EXISTS "users_read_own_admin_status" ON admin_users;
CREATE POLICY "users_read_own_admin_status"
  ON admin_users
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 4. app_settings: admin-only reads/writes, gated through the helper
DROP POLICY IF EXISTS "admins_read_app_settings" ON app_settings;
CREATE POLICY "admins_read_app_settings"
  ON app_settings
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins_write_app_settings" ON app_settings;
CREATE POLICY "admins_write_app_settings"
  ON app_settings
  FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- 5. user_credits admin scope via helper. The original per-user policies
-- ("users_read_own_credits", "users_insert_own_credits", "users_update_own_credits"
-- from supabase_credits_rls.sql) remain intact so normal credit flow keeps working.
DROP POLICY IF EXISTS "admins_read_all_user_credits" ON user_credits;
CREATE POLICY "admins_read_all_user_credits"
  ON user_credits
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins_update_all_user_credits" ON user_credits;
CREATE POLICY "admins_update_all_user_credits"
  ON user_credits
  FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "admins_delete_all_user_credits" ON user_credits;
CREATE POLICY "admins_delete_all_user_credits"
  ON user_credits
  FOR DELETE
  TO authenticated
  USING (public.is_admin(auth.uid()));
