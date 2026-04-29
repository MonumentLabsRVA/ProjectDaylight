-- Migration: 0058_message_threads_retrieval_blurb
-- Description: Plan v2 addendum — adds `message_threads.retrieval_blurb` and
--   folds it into the summary_fts tsvector.
--
--   Why: The neutral `summary` field (role-keyed, no loaded language) is good
--   for chat display but bad for keyword retrieval. A parent searching the
--   chat in their own words types "withheld", "hostile", "blocked", "kept her"
--   — words the digest deliberately avoids. The new `retrieval_blurb` is a
--   2-3 sentence purpose-built synopsis written WITH that vocabulary so the
--   FTS column has something to bite. Populated by thread-summarization.ts
--   alongside the rest of the structured output.
--
--   Path: add column → drop FTS index/column/fn (must drop bottom-up because
--   the index references the column, the column references the fn) → recreate
--   the helper with a 5th arg → recreate the column (re-tokenizes every row
--   for free since blurb is null pre-backfill, that's a no-op string) →
--   recreate the index. After this migration, run the slim retrieval-blurb
--   backfill to populate existing rows; the FTS column re-tokenizes on UPDATE.
--
-- Idempotent — safe to re-run.

BEGIN;

-- 1. Add the new column. Nullable until the backfill populates it.
ALTER TABLE message_threads
  ADD COLUMN IF NOT EXISTS retrieval_blurb text;

COMMENT ON COLUMN message_threads.retrieval_blurb IS
  'Per-thread retrieval-friendly synopsis (2-3 sentences, ~40 words). Uses the natural framing a parent might search for ("withheld", "hostile", "blocked", "stonewalled", "agreed", "compromised") which the neutral `summary` deliberately avoids. Folded into summary_fts so search_threads hits behavioral vocabulary. Populated by thread-summarization.ts.';

-- 2. Drop dependent index → column → old 4-arg fn (bottom-up).
DROP INDEX IF EXISTS idx_message_threads_fts;

ALTER TABLE message_threads
  DROP COLUMN IF EXISTS summary_fts;

DROP FUNCTION IF EXISTS message_threads_fts(text, text, text[], jsonb);

-- 3. New 5-arg helper. Same shape as 0057, plus retrieval_blurb.
CREATE OR REPLACE FUNCTION message_threads_fts(
  p_summary          text,
  p_subject          text,
  p_participants     text[],
  p_anchors          jsonb,
  p_retrieval_blurb  text
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
    jsonb_string_array_to_text(coalesce(p_anchors, '{}'::jsonb) -> 'topics') || ' ' ||
    coalesce(p_retrieval_blurb, '')
  );
$$;

-- 4. Recreate the STORED generated column with the 5-arg call.
ALTER TABLE message_threads
  ADD COLUMN summary_fts tsvector GENERATED ALWAYS AS (
    message_threads_fts(summary, subject, participants, search_anchors, retrieval_blurb)
  ) STORED;

-- 5. Rebuild the GIN index.
CREATE INDEX IF NOT EXISTS idx_message_threads_fts
  ON message_threads USING gin (summary_fts);

COMMENT ON COLUMN message_threads.summary_fts IS
  'Generated tsvector over summary + subject + participants + search_anchors.proper_nouns + search_anchors.topics + retrieval_blurb. Indexed via idx_message_threads_fts.';

COMMIT;
