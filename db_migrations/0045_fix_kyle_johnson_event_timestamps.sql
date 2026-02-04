-- Migration: 0045_fix_kyle_johnson_event_timestamps
-- Description: Fix ALL event timestamps for gkjohns@gmail.com that have timezone bugs
-- 
-- Issue: Events extracted via journal-extraction.ts (Inngest function) were assigned timestamps
-- using UTC interpretation instead of the user's local timezone (America/New_York).
-- The function was not passing timezone context to the LLM, so timestamps like "7:30 AM" 
-- were stored as 07:30 UTC instead of 12:30 UTC (which displays as 07:30 EST).
-- 
-- Analysis of min_display_hour by journal entry identified the following as BROKEN:
--   - Entries showing min_hour of 0-5 indicate daytime events displayed as early morning
--   - Pattern: correct entries (Feb 2026+) have min_hour >= 7
--   - Pattern: broken entries have events displaying at 1-5 AM when they should be 6-10 AM
--
-- Fix: Add 5 hours to shift timestamps from incorrect UTC to correct EST representation

-- ============================================================================
-- STEP 1: Preview the affected events (before fix)
-- ============================================================================

-- Show all events with suspiciously early display times (likely broken)
SELECT 
  e.id,
  e.title,
  e.primary_timestamp AT TIME ZONE 'America/New_York' as current_display_est,
  EXTRACT(HOUR FROM e.primary_timestamp AT TIME ZONE 'America/New_York') as hour,
  (e.primary_timestamp + INTERVAL '5 hours') AT TIME ZONE 'America/New_York' as after_fix_est,
  je.reference_date,
  je.created_at::date as journal_created
FROM events e
JOIN journal_entries je ON e.journal_entry_id = je.id
JOIN auth.users u ON e.user_id = u.id
WHERE u.email = 'gkjohns@gmail.com'
  AND e.primary_timestamp IS NOT NULL
  AND EXTRACT(HOUR FROM e.primary_timestamp AT TIME ZONE 'America/New_York') < 6
ORDER BY je.created_at DESC, e.primary_timestamp ASC;

-- ============================================================================
-- STEP 2: Apply the fix to events with display hour < 6 AM
-- ============================================================================

-- These are events that display between midnight and 6 AM EST, but based on
-- descriptions should be daytime events. Adding 5 hours corrects the timezone offset.
-- 
-- Safety: Events that legitimately occurred at night (like late bedtimes) 
-- might be slightly off, but most parenting events happen during waking hours.

UPDATE events
SET 
  primary_timestamp = primary_timestamp + INTERVAL '5 hours',
  updated_at = NOW()
WHERE id IN (
  SELECT e.id
  FROM events e
  JOIN journal_entries je ON e.journal_entry_id = je.id
  JOIN auth.users u ON e.user_id = u.id
  WHERE u.email = 'gkjohns@gmail.com'
    AND e.primary_timestamp IS NOT NULL
    -- Events displaying before 6 AM EST are almost certainly broken
    AND EXTRACT(HOUR FROM e.primary_timestamp AT TIME ZONE 'America/New_York') < 6
);

-- ============================================================================
-- STEP 3: Verify the fix
-- ============================================================================

-- Should show no events with display hour < 6 AM for this user
SELECT 
  e.id,
  e.title,
  e.primary_timestamp AT TIME ZONE 'America/New_York' as displayed_in_est,
  EXTRACT(HOUR FROM e.primary_timestamp AT TIME ZONE 'America/New_York') as hour,
  je.reference_date,
  je.created_at::date as journal_created
FROM events e
JOIN journal_entries je ON e.journal_entry_id = je.id
JOIN auth.users u ON e.user_id = u.id
WHERE u.email = 'gkjohns@gmail.com'
  AND e.primary_timestamp IS NOT NULL
ORDER BY e.primary_timestamp DESC
LIMIT 50;

-- ============================================================================
-- STEP 4: Summary of affected journal entries
-- ============================================================================

-- Show count of events fixed per journal entry
SELECT 
  je.created_at::date as journal_created,
  je.reference_date,
  COUNT(*) as total_events,
  SUM(CASE WHEN EXTRACT(HOUR FROM e.primary_timestamp AT TIME ZONE 'America/New_York') >= 6 THEN 1 ELSE 0 END) as normal_hour_events,
  MIN(EXTRACT(HOUR FROM e.primary_timestamp AT TIME ZONE 'America/New_York')) as min_hour,
  MAX(EXTRACT(HOUR FROM e.primary_timestamp AT TIME ZONE 'America/New_York')) as max_hour
FROM events e
JOIN journal_entries je ON e.journal_entry_id = je.id
JOIN auth.users u ON e.user_id = u.id
WHERE u.email = 'gkjohns@gmail.com'
  AND e.primary_timestamp IS NOT NULL
GROUP BY je.created_at::date, je.reference_date
ORDER BY je.created_at::date DESC;
