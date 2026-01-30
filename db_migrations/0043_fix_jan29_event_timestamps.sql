-- Migration: 0043_fix_jan29_event_timestamps
-- Description: Fix event timestamps that were incorrectly generated without timezone context
-- 
-- Issue: Events from the January 29, 2026 journal entry were assigned timestamps
-- using UTC interpretation instead of the user's local timezone (America/New_York).
-- This caused some events to appear on January 28th when they should be on January 29th.

-- ============================================================================
-- STEP 1: First, run this SELECT to see the current state of events
-- ============================================================================

SELECT 
  e.id,
  e.title,
  e.primary_timestamp,
  (e.primary_timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::timestamp as displayed_in_est,
  je.reference_date,
  je.created_at as journal_created_at
FROM events e
LEFT JOIN journal_entries je ON e.journal_entry_id = je.id
WHERE e.primary_timestamp >= '2026-01-27'
  AND e.primary_timestamp < '2026-01-31'
ORDER BY e.primary_timestamp DESC;

-- ============================================================================
-- STEP 2: Once you see the data, run ONE of the fixes below
-- ============================================================================

-- Option A: Move Jan 28 events to Jan 29 (add 24 hours)
-- Use this if events showing on Jan 28 should actually be on Jan 29
/*
UPDATE events
SET primary_timestamp = primary_timestamp + INTERVAL '24 hours'
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries 
  WHERE reference_date = '2026-01-29'
)
AND primary_timestamp::date = '2026-01-28';
*/

-- Option B: Add 5 hours to fix timezone offset only
-- Use this if the day is correct but time needs EST adjustment
/*
UPDATE events
SET primary_timestamp = primary_timestamp + INTERVAL '5 hours'
WHERE journal_entry_id IN (
  SELECT id FROM journal_entries 
  WHERE reference_date = '2026-01-29'
)
AND primary_timestamp::date = '2026-01-28';
*/

-- ============================================================================
-- STEP 3: Verify the fix by running the SELECT from Step 1 again
-- ============================================================================
