-- Migration: Add timezone and avatar_url to profiles table
-- These were previously stored in auth.users.raw_user_meta_data which is
-- meant for OAuth provider data, not application preferences.

-- Add timezone column (IANA timezone string, e.g., 'America/New_York')
ALTER TABLE public.profiles
ADD COLUMN timezone text DEFAULT 'UTC';

-- Add avatar_url column (allows users to set custom avatar, overriding OAuth)
ALTER TABLE public.profiles
ADD COLUMN avatar_url text;

-- Backfill timezone from auth.users.raw_user_meta_data if it exists
UPDATE public.profiles p
SET timezone = COALESCE(
  (SELECT u.raw_user_meta_data->>'timezone' FROM auth.users u WHERE u.id = p.id),
  'UTC'
);

-- Add a comment explaining the timezone column
COMMENT ON COLUMN public.profiles.timezone IS 'User timezone preference (IANA format). Used for date display and "today" calculations.';
COMMENT ON COLUMN public.profiles.avatar_url IS 'Custom avatar URL. If NULL, falls back to OAuth provider avatar.';

