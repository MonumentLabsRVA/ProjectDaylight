-- 0037_journal_entries_job_reference.sql
-- Phase 1: Link journal entries to background jobs

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'journal_entries'
      AND column_name = 'extraction_job_id'
  ) THEN
    ALTER TABLE journal_entries
      ADD COLUMN extraction_job_id UUID REFERENCES jobs(id);
  END IF;
END
$$;


