-- Add journal_entry_id column to events table for direct relationship
-- This replaces the indirect lookup through jobs.result_summary.event_ids

-- Add the column (nullable to allow existing events without journal entries)
ALTER TABLE events
ADD COLUMN journal_entry_id uuid REFERENCES journal_entries(id) ON DELETE SET NULL;

-- Create index for efficient lookups
CREATE INDEX idx_events_journal_entry_id ON events(journal_entry_id) WHERE journal_entry_id IS NOT NULL;

-- Backfill existing events from jobs.result_summary.event_ids
-- This extracts event_ids from the JSONB result_summary and updates the corresponding events
UPDATE events e
SET journal_entry_id = j.journal_entry_id
FROM jobs j
WHERE j.result_summary IS NOT NULL
  AND j.journal_entry_id IS NOT NULL
  AND j.result_summary->>'event_ids' IS NOT NULL
  AND e.id = ANY(
    SELECT jsonb_array_elements_text(j.result_summary->'event_ids')::uuid
  );

-- Add comment for documentation
COMMENT ON COLUMN events.journal_entry_id IS 'References the journal entry this event was extracted from, if any';
