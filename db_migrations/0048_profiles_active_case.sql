-- Migration: 0048_profiles_active_case
-- Description: Persistent "currently selected case" pointer on profiles.
--              Replaces the original cookie-based design — DB column survives
--              cookie clears and works across devices. Source of truth for
--              `getActiveCaseId()`. NULL means "use most recent".

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS active_case_id UUID
  REFERENCES cases(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_active_case_id
  ON profiles (active_case_id) WHERE active_case_id IS NOT NULL;

COMMENT ON COLUMN profiles.active_case_id IS 'The case currently selected in the user''s sidebar. NULL means "use most recent". Source of truth for getActiveCaseId().';
