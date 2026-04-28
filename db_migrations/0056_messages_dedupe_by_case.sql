-- Migration: 0056_messages_dedupe_by_case
-- Description: Fix duplicate messages from re-imported OFW exports.
--
-- The ofw-ingest function upserted with onConflict (evidence_id, sequence_number)
-- — that key only dedupes within a single upload, so each re-import of an OFW
-- report created an entire fresh copy of every message under a new evidence_id.
-- The natural identity of an OFW message is (case_id, sequence_number): OFW's
-- internal id is stable across re-exports, and a case has at most one OFW
-- account behind it.
--
-- This migration:
--   1) Deletes duplicate messages, keeping the row tied to the EARLIEST
--      evidence (i.e. the original upload). Deterministic tiebreak by id ASC.
--   2) Adds UNIQUE (case_id, sequence_number) so future re-imports dedupe at
--      the DB level even if the application key drifts again.
--   3) Recomputes message_threads denormalized columns whose counts/dates were
--      inflated by the dupes. (The LLM-generated `summary` text is left alone
--      — it was built from duplicated input, but the duplicated text was
--      identical so the model treated repeats as repeats. Re-summarize via
--      the backfill endpoint if a fresh pass is wanted.)
--
-- Idempotent — re-running this is a no-op once dupes are gone and the
-- constraint exists.

BEGIN;

-- ============================================================
-- 1. Dedupe messages: keep row from earliest evidence per (case_id, sequence_number)
-- ============================================================

WITH ranked AS (
  SELECT
    m.id,
    row_number() OVER (
      PARTITION BY m.case_id, m.sequence_number
      ORDER BY e.created_at ASC NULLS LAST, m.id ASC
    ) AS rn
  FROM messages m
  LEFT JOIN evidence e ON e.id = m.evidence_id
)
DELETE FROM messages
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- ============================================================
-- 2. Add the canonical uniqueness constraint
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uniq_messages_case_sequence'
  ) THEN
    ALTER TABLE messages
      ADD CONSTRAINT uniq_messages_case_sequence
      UNIQUE (case_id, sequence_number);
  END IF;
END
$$;

-- The pre-existing uniq_messages_evidence_sequence index is still satisfied
-- (each kept row has a single evidence_id, and sequence_number was unique per
-- evidence by construction), so we leave it in place. It's redundant for
-- upserts now but cheap to keep.

-- ============================================================
-- 3. Refresh message_threads denormalized counts/dates/participants
-- ============================================================

WITH agg AS (
  SELECT
    case_id,
    thread_id,
    COUNT(*)::int AS message_count,
    MIN(sent_at) AS first_sent_at,
    MAX(sent_at) AS last_sent_at,
    array_agg(DISTINCT sender ORDER BY sender) AS participants
  FROM messages
  WHERE thread_id IS NOT NULL
  GROUP BY case_id, thread_id
)
UPDATE message_threads mt
SET
  message_count = agg.message_count,
  first_sent_at = agg.first_sent_at,
  last_sent_at  = agg.last_sent_at,
  participants  = agg.participants,
  updated_at    = now()
FROM agg
WHERE mt.case_id = agg.case_id
  AND mt.thread_id = agg.thread_id
  AND (
    mt.message_count IS DISTINCT FROM agg.message_count
    OR mt.first_sent_at IS DISTINCT FROM agg.first_sent_at
    OR mt.last_sent_at IS DISTINCT FROM agg.last_sent_at
    OR mt.participants IS DISTINCT FROM agg.participants
  );

COMMIT;
