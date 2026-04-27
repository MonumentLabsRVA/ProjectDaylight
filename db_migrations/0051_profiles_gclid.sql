-- Migration: 0051_profiles_gclid
-- Description: Capture Google Ads click ID on the user record so we can later
--              attribute Stripe purchases back to the original ad click. The
--              client captures gclid on first touch via the existing
--              signup-attribution plugin and the server endpoint copies it onto
--              the profile after auth.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS gclid TEXT,
  ADD COLUMN IF NOT EXISTS gclid_captured_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_gclid
  ON profiles (gclid) WHERE gclid IS NOT NULL;

COMMENT ON COLUMN profiles.gclid IS 'Google Ads click ID captured at first touch and persisted at signup. Used for Stripe → Google Ads offline conversion attribution. NULL means non-ad traffic.';
COMMENT ON COLUMN profiles.gclid_captured_at IS 'Timestamp when the gclid was attached to the profile (i.e. signup time, not click time).';
