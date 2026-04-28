-- Migration: 0057_message_threads_fts_anchors
-- Description: Plan v2 / Smarter Chat Retrieval round 2 — extends the
--   message_threads.summary_fts tsvector to include search_anchors.proper_nouns
--   and search_anchors.topics.
--
--   Why: The thread-summarization prompt deliberately tells the model to refer
--   to participants by role ("the user", "the co-parent") instead of by name
--   in the prose summary. Names live ONLY in search_anchors.proper_nouns. v1
--   indexed `summary || subject || participants` — but `participants` is the
--   set of OFW message *senders*, not third parties named in the bodies. Net
--   effect: a query for "Ms Katy" (mentioned across many threads but never a
--   sender) found near-zero hits even though the data was right there in
--   the JSONB.
--
--   This migration replaces the FTS helper to also tokenize the proper_nouns
--   and topics arrays from search_anchors. dates_mentioned and numbers stay
--   out — dates have a dedicated date-range filter and numbers tokenize
--   poorly under to_tsvector('english').
--
-- Path: drop the index → drop the generated column → drop the old 3-arg
--   helper → install a small jsonb-array-to-text helper → install the new
--   4-arg helper → recreate the column (Postgres re-evaluates the expression
--   for every existing row, so this acts as a free re-tokenization on apply)
--   → recreate the index.
--
-- Idempotent — safe to re-run.

BEGIN;

-- ------------------------------------------------------------
-- 1. Drop the dependent index, then the generated column, then the old fn.
--    Order matters: the index references the column, the column references
--    the function. Drop bottom-up.
-- ------------------------------------------------------------

DROP INDEX IF EXISTS idx_message_threads_fts;

ALTER TABLE message_threads
  DROP COLUMN IF EXISTS summary_fts;

DROP FUNCTION IF EXISTS message_threads_fts(text, text, text[]);

-- ------------------------------------------------------------
-- 2. Helper: turn a jsonb string-array into a single space-joined text blob.
--    Defensive against null and non-array inputs (returns '').
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION jsonb_string_array_to_text(p jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT coalesce(string_agg(v, ' '), '')
  FROM jsonb_array_elements_text(
    CASE WHEN jsonb_typeof(p) = 'array' THEN p ELSE '[]'::jsonb END
  ) AS v;
$$;

-- ------------------------------------------------------------
-- 3. New 4-arg FTS helper. Same shape as v1, but now also folds in
--    proper_nouns + topics from the search_anchors JSONB.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION message_threads_fts(
  p_summary       text,
  p_subject       text,
  p_participants  text[],
  p_anchors       jsonb
)
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT to_tsvector(
    'english'::regconfig,
    coalesce(p_summary, '') || ' ' ||
    coalesce(p_subject, '') || ' ' ||
    array_to_string(coalesce(p_participants, '{}'::text[]), ' ') || ' ' ||
    jsonb_string_array_to_text(coalesce(p_anchors, '{}'::jsonb) -> 'proper_nouns') || ' ' ||
    jsonb_string_array_to_text(coalesce(p_anchors, '{}'::jsonb) -> 'topics')
  );
$$;

-- ------------------------------------------------------------
-- 4. Recreate the STORED generated column. This re-evaluates the expression
--    for every existing row, so the new tokens (proper nouns, topics) are
--    indexed without a separate backfill step.
-- ------------------------------------------------------------

ALTER TABLE message_threads
  ADD COLUMN summary_fts tsvector GENERATED ALWAYS AS (
    message_threads_fts(summary, subject, participants, search_anchors)
  ) STORED;

-- ------------------------------------------------------------
-- 5. Rebuild the GIN index over the new tsvector.
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_message_threads_fts
  ON message_threads USING gin (summary_fts);

-- ------------------------------------------------------------
-- 6. Documentation
-- ------------------------------------------------------------

COMMENT ON COLUMN message_threads.summary_fts IS
  'Generated tsvector covering summary + subject + participants + search_anchors.proper_nouns + search_anchors.topics. Indexed via idx_message_threads_fts. Used by the search_threads chat tool.';

COMMENT ON FUNCTION jsonb_string_array_to_text(jsonb) IS
  'Joins a jsonb string-array into a single space-separated text blob. Returns empty string for null or non-array input. Used by message_threads_fts to fold search_anchors arrays into the FTS column.';

COMMIT;
