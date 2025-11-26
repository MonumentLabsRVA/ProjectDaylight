-- Migration: 0020_rename_captures_to_journal_entries.sql
-- Description: Rename "captures" infrastructure to "journal_entries"
--   - captures table -> journal_entries
--   - capture_evidence table -> journal_entry_evidence  
--   - capture_status enum -> journal_entry_status
--   - capture_id columns -> journal_entry_id
--
-- This migration preserves all existing data by using ALTER TABLE ... RENAME.

-- =============================================================================
-- 1. Rename the capture_status enum to journal_entry_status
-- =============================================================================
-- PostgreSQL doesn't support directly renaming enum types, so we need to:
-- 1. Create the new enum type
-- 2. Update columns to use the new type
-- 3. Drop the old enum type

-- Create the new enum type with the same values
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'journal_entry_status') THEN
    CREATE TYPE public.journal_entry_status AS ENUM (
      'draft',
      'processing',
      'review',
      'completed',
      'cancelled'
    );
  END IF;
END
$$;


-- =============================================================================
-- 2. Rename the captures table to journal_entries
-- =============================================================================

-- Drop existing policies before rename
DROP POLICY IF EXISTS captures_select_own ON public.captures;
DROP POLICY IF EXISTS captures_insert_own ON public.captures;
DROP POLICY IF EXISTS captures_update_own ON public.captures;
DROP POLICY IF EXISTS captures_delete_own ON public.captures;

-- Drop existing trigger before rename
DROP TRIGGER IF EXISTS captures_updated_at_trigger ON public.captures;

-- Rename the table
ALTER TABLE IF EXISTS public.captures RENAME TO journal_entries;

-- Rename the status column to use the new enum type
-- First, add a new column with the new type
ALTER TABLE public.journal_entries 
ADD COLUMN IF NOT EXISTS status_new public.journal_entry_status;

-- Copy data from old status column
UPDATE public.journal_entries 
SET status_new = status::text::public.journal_entry_status;

-- Drop the old column and rename the new one
ALTER TABLE public.journal_entries DROP COLUMN IF EXISTS status;
ALTER TABLE public.journal_entries RENAME COLUMN status_new TO status;

-- Set NOT NULL and default
ALTER TABLE public.journal_entries 
ALTER COLUMN status SET NOT NULL,
ALTER COLUMN status SET DEFAULT 'draft'::public.journal_entry_status;

-- Rename indexes
ALTER INDEX IF EXISTS captures_user_id_idx RENAME TO journal_entries_user_id_idx;
ALTER INDEX IF EXISTS captures_status_idx RENAME TO journal_entries_status_idx;
ALTER INDEX IF EXISTS captures_user_status_idx RENAME TO journal_entries_user_status_idx;

-- Recreate RLS policies with new names
CREATE POLICY journal_entries_select_own ON public.journal_entries
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY journal_entries_insert_own ON public.journal_entries
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY journal_entries_update_own ON public.journal_entries
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY journal_entries_delete_own ON public.journal_entries
  FOR DELETE USING (auth.uid() = user_id);

-- Recreate updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_journal_entries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER journal_entries_updated_at_trigger
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_journal_entries_updated_at();

-- Update table comment
COMMENT ON TABLE public.journal_entries IS 
  'Journal entries. Tracks user narratives from initial input through evidence processing to final event creation.';


-- =============================================================================
-- 3. Rename capture_evidence table to journal_entry_evidence
-- =============================================================================

-- Drop existing policies
DROP POLICY IF EXISTS capture_evidence_select_own ON public.capture_evidence;
DROP POLICY IF EXISTS capture_evidence_insert_own ON public.capture_evidence;
DROP POLICY IF EXISTS capture_evidence_update_own ON public.capture_evidence;
DROP POLICY IF EXISTS capture_evidence_delete_own ON public.capture_evidence;

-- Rename the table
ALTER TABLE IF EXISTS public.capture_evidence RENAME TO journal_entry_evidence;

-- Rename the capture_id column to journal_entry_id
ALTER TABLE public.journal_entry_evidence RENAME COLUMN capture_id TO journal_entry_id;

-- Rename indexes
ALTER INDEX IF EXISTS capture_evidence_capture_id_idx RENAME TO journal_entry_evidence_journal_entry_id_idx;
ALTER INDEX IF EXISTS capture_evidence_evidence_id_idx RENAME TO journal_entry_evidence_evidence_id_idx;

-- Rename foreign key constraint (rename by dropping and recreating)
ALTER TABLE public.journal_entry_evidence 
DROP CONSTRAINT IF EXISTS capture_evidence_capture_id_fkey;

ALTER TABLE public.journal_entry_evidence 
ADD CONSTRAINT journal_entry_evidence_journal_entry_id_fkey 
FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE CASCADE;

-- The evidence_id foreign key should be renamed too for consistency
ALTER TABLE public.journal_entry_evidence 
DROP CONSTRAINT IF EXISTS capture_evidence_evidence_id_fkey;

ALTER TABLE public.journal_entry_evidence 
ADD CONSTRAINT journal_entry_evidence_evidence_id_fkey 
FOREIGN KEY (evidence_id) REFERENCES public.evidence(id) ON DELETE CASCADE;

-- Rename unique constraint
ALTER TABLE public.journal_entry_evidence 
DROP CONSTRAINT IF EXISTS capture_evidence_capture_id_evidence_id_key;

ALTER TABLE public.journal_entry_evidence 
ADD CONSTRAINT journal_entry_evidence_journal_entry_id_evidence_id_key 
UNIQUE (journal_entry_id, evidence_id);

-- Recreate RLS policies
CREATE POLICY journal_entry_evidence_select_own ON public.journal_entry_evidence
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries je 
      WHERE je.id = journal_entry_evidence.journal_entry_id 
      AND je.user_id = auth.uid()
    )
  );

CREATE POLICY journal_entry_evidence_insert_own ON public.journal_entry_evidence
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.journal_entries je 
      WHERE je.id = journal_entry_evidence.journal_entry_id 
      AND je.user_id = auth.uid()
    )
  );

CREATE POLICY journal_entry_evidence_update_own ON public.journal_entry_evidence
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries je 
      WHERE je.id = journal_entry_evidence.journal_entry_id 
      AND je.user_id = auth.uid()
    )
  );

CREATE POLICY journal_entry_evidence_delete_own ON public.journal_entry_evidence
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.journal_entries je 
      WHERE je.id = journal_entry_evidence.journal_entry_id 
      AND je.user_id = auth.uid()
    )
  );

-- Update table comment
COMMENT ON TABLE public.journal_entry_evidence IS 
  'Junction table linking evidence items to journal entries. Tracks processing status for each piece of evidence within a journal entry.';


-- =============================================================================
-- 4. Cleanup: Drop old enum type and old trigger function if they exist
-- =============================================================================

-- Drop old trigger function
DROP FUNCTION IF EXISTS public.update_captures_updated_at();

-- Drop old enum type (only if no columns are using it anymore)
-- We do this carefully by checking first
DO $$
BEGIN
  -- Check if capture_status is still in use anywhere
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE udt_name = 'capture_status'
  ) THEN
    DROP TYPE IF EXISTS public.capture_status;
  END IF;
END
$$;


