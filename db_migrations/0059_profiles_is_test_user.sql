-- Migration: Add is_test_user flag to profiles
-- Marks throwaway accounts created from /internal/test-users for onboarding/QA testing.
-- Source-of-truth flag (mirrored on auth.users.user_metadata for visibility).

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_test_user BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_test_user IS
  'Throwaway account created from the /internal/test-users page for onboarding/QA testing. Safe to delete.';

-- Partial index — listing test users is rare, almost all rows are real users.
CREATE INDEX IF NOT EXISTS profiles_is_test_user_idx
  ON public.profiles (is_test_user)
  WHERE is_test_user = true;
