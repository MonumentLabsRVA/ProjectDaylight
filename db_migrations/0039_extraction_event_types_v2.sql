-- Migration: 0039_extraction_event_types_v2.sql
-- Description: Add a new, more granular event type column (type_v2)
--              to support custody-specific event categorization while
--              keeping the legacy event_type enum column intact.

-- =============================================================================
-- 1. Add type_v2 column to events table
-- =============================================================================

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS type_v2 text;

-- =============================================================================
-- 2. Add CHECK constraint for valid type_v2 values
-- =============================================================================
-- New event types (text-based, not a PostgreSQL enum) corresponding
-- to the improved extraction schema:
--   - 'parenting_time'
--   - 'caregiving'
--   - 'household'
--   - 'coparent_conflict'
--   - 'gatekeeping'
--   - 'communication'
--   - 'medical'
--   - 'school'
--   - 'legal'
--
-- The column remains nullable to allow a transition period where
-- some events only have the legacy "type" populated.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname = 'events_type_v2_check'
    AND    conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_type_v2_check
      CHECK (
        type_v2 IS NULL OR
        type_v2 IN (
          'parenting_time',
          'caregiving',
          'household',
          'coparent_conflict',
          'gatekeeping',
          'communication',
          'medical',
          'school',
          'legal'
        )
      );
  END IF;
END
$$;
