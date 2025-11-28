-- Add onboarding tracking to profiles table
-- This tracks whether a user has completed (or skipped) the onboarding flow

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz DEFAULT NULL;

-- Add a comment explaining the column
COMMENT ON COLUMN public.profiles.onboarding_completed_at IS 
  'Timestamp when user completed or skipped onboarding. NULL means they have not seen onboarding yet.';

