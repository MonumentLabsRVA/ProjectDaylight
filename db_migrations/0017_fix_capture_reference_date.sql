-- Migration: 0017_fix_capture_reference_date
-- Description: Fix reference_date that was incorrectly stored as UTC date instead of local date
-- The capture was created at 10:53 PM Eastern on Nov 25, but the reference_date was stored as Nov 26 (UTC)

-- Fix the specific entry
UPDATE captures 
SET reference_date = '2025-11-25'
WHERE id = '2292071d-d727-4637-9731-a739def20372'
  AND reference_date = '2025-11-26';  -- Safety check

-- Note: Going forward, the code now uses getDateStringInTimezone() to get the correct local date

