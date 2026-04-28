-- Migration: 0055_thread_aggregation_rpcs
-- Description: Postgres-side aggregation helpers that the thread fan-out and
--   drift check need. The TS implementations (summarizeThreadMissing,
--   diffThreadsForUpload in src/server/utils/threads.ts) were doing
--   `.from('messages').select('thread_id')` and grouping in JS — which
--   silently caps at supabase-js's default 1000-row limit. On a case with
--   ~4k messages, that meant the ofw-ingest fan-out only enqueued
--   summarization for ~46 of 192 threads.
--
--   Pushing the aggregation into SQL fixes the cap and is also the right
--   shape (server-side GROUP BY beats round-tripping every row).
--
-- Idempotent — CREATE OR REPLACE on each function.

BEGIN;

-- Returns one row per distinct thread_id in the case, with the live
-- message_count. Used by summarizeThreadMissing to compare against
-- message_threads.message_count and decide what to (re-)summarize.
CREATE OR REPLACE FUNCTION case_thread_message_counts(p_case_id uuid)
RETURNS TABLE(thread_id text, message_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT thread_id, count(*)::bigint
  FROM messages
  WHERE case_id = p_case_id
    AND thread_id IS NOT NULL
  GROUP BY thread_id;
$$;

-- Returns the distinct thread_ids present in a single evidence upload.
-- Used by diffThreadsForUpload to compute drift vs message_threads.
CREATE OR REPLACE FUNCTION evidence_thread_ids(p_case_id uuid, p_evidence_id uuid)
RETURNS TABLE(thread_id text)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT DISTINCT thread_id
  FROM messages
  WHERE case_id = p_case_id
    AND evidence_id = p_evidence_id
    AND thread_id IS NOT NULL;
$$;

COMMENT ON FUNCTION case_thread_message_counts(uuid) IS
  'Per-thread live message counts for a case. Powers the thread-summary fan-out and backfill — server-side GROUP BY avoids the supabase-js 1000-row cap.';
COMMENT ON FUNCTION evidence_thread_ids(uuid, uuid) IS
  'Distinct thread_ids in one evidence upload. Used by drift detection in ofw-ingest.';

COMMIT;
