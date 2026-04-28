-- Migration: 0053_message_threads
-- Description: Plan 20260428 / Smarter Chat Retrieval — adds a thread-level
--   summary layer over OFW messages. One row per (case_id, thread_id) holding
--   an LLM-generated paragraph summary, controlled-vocab tone + flags, and
--   "search anchors" (proper nouns, topics, dates, numbers) the chat agent
--   uses for keyword retrieval. Populated by the thread-summarization Inngest
--   function fanned out from ofw-ingest.
--
-- Linking: messages.thread_id is a slug (text) the parser derives from subject.
--   The pair (case_id, thread_id) is the natural key here. evidence_id tracks
--   which OFW upload first created the thread.
--
-- No audit trigger: summaries regenerate freely (re-import, prompt version
--   bumps, etc.). Not a primary-source artifact.
--
-- Idempotent — every CREATE is guarded so a re-run is a no-op.

BEGIN;

-- Immutable tsvector helper. `array_to_string` is marked STABLE (not
-- IMMUTABLE) in Postgres because of locale/IO concerns, which prevents using
-- it directly inside a STORED generated column. This wrapper is safe in
-- practice (same inputs => same tsvector for our text data) and lets us keep
-- a clean STORED summary_fts column.
CREATE OR REPLACE FUNCTION message_threads_fts(p_summary text, p_subject text, p_participants text[])
RETURNS tsvector
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT to_tsvector(
    'english'::regconfig,
    coalesce(p_summary,'') || ' ' ||
    coalesce(p_subject,'') || ' ' ||
    array_to_string(coalesce(p_participants,'{}'::text[]),' ')
  );
$$;

-- Controlled-vocab tone enum. Five values: cooperative / neutral / tense /
-- hostile / mixed. `mixed` covers genuinely-mixed and unclear cases — kept as
-- one bucket per design call 2026-04-28 (no separate `unclear`).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'thread_tone') THEN
    CREATE TYPE thread_tone AS ENUM ('cooperative','neutral','tense','hostile','mixed');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS message_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  evidence_id uuid REFERENCES evidence(id) ON DELETE SET NULL,
  thread_id text NOT NULL,

  -- Denormalized thread metadata — cheap to recompute, but having it on the row
  -- means search_threads can filter/sort without joining back to messages.
  subject text,
  participants text[] NOT NULL DEFAULT '{}',
  message_count int NOT NULL DEFAULT 0,
  first_sent_at timestamptz,
  last_sent_at timestamptz,

  -- The LLM-generated payload.
  summary text,
  tone thread_tone,
  flags text[] NOT NULL DEFAULT '{}',
  search_anchors jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Provenance — lets us re-run summarization selectively when prompts change.
  model text,
  summary_version int NOT NULL DEFAULT 1,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Generated tsvector covering summary + subject + participants. Stored so
  -- the FTS index is plain (not expression-based), and so the search_threads
  -- tool can call supabase-js's `.textSearch('summary_fts', ...)` directly.
  -- A query like "Katy" hits prose summaries that mention her AND threads
  -- where she's a named participant — without JSONB path tricks.
  summary_fts tsvector GENERATED ALWAYS AS (
    message_threads_fts(summary, subject, participants)
  ) STORED
);

-- ============================================================
-- Indexes
-- ============================================================

-- Natural key for upsert. One summary per thread per case.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_message_threads_case_thread
  ON message_threads (case_id, thread_id);

-- Default thread listing: most-recent-first within a case.
CREATE INDEX IF NOT EXISTS idx_message_threads_case_last_sent
  ON message_threads (case_id, last_sent_at DESC);

-- Tone filter used by search_threads.
CREATE INDEX IF NOT EXISTS idx_message_threads_case_tone
  ON message_threads (case_id, tone);

-- Flag filter (array overlap operator &&).
CREATE INDEX IF NOT EXISTS idx_message_threads_flags
  ON message_threads USING gin (flags);

-- FTS index over the generated summary_fts column. Keeping the tsvector as a
-- stored column (rather than an expression index) means the search_threads
-- tool can use supabase-js's `.textSearch('summary_fts', ...)` API directly.
CREATE INDEX IF NOT EXISTS idx_message_threads_fts
  ON message_threads USING gin (summary_fts);

-- ============================================================
-- RLS — owner-only via cases.user_id, mirroring messages / chats.
-- Plan 03 will extend SELECT to case_collaborators.
-- ============================================================

ALTER TABLE message_threads ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'message_threads'
      AND policyname = 'message_threads_owner_via_case'
  ) THEN
    CREATE POLICY message_threads_owner_via_case ON message_threads
      FOR ALL USING (
        EXISTS (SELECT 1 FROM cases c WHERE c.id = message_threads.case_id AND c.user_id = (SELECT auth.uid()))
      ) WITH CHECK (
        EXISTS (SELECT 1 FROM cases c WHERE c.id = message_threads.case_id AND c.user_id = (SELECT auth.uid()))
      );
  END IF;
END
$$;

-- ============================================================
-- updated_at trigger — uses the shared set_updated_at() function.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'message_threads_set_updated_at'
  ) THEN
    CREATE TRIGGER message_threads_set_updated_at
      BEFORE UPDATE ON message_threads
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END
$$;

-- ============================================================
-- Documentation
-- ============================================================

COMMENT ON TABLE message_threads IS
  'LLM-generated thread-level summaries over OFW messages. One row per (case_id, thread_id). Powers the search_threads chat tool — agent reads thread summaries first and only drills into individual messages when needed.';
COMMENT ON COLUMN message_threads.thread_id IS
  'Slug derived by the OFW parser from the message subject. Matches messages.thread_id.';
COMMENT ON COLUMN message_threads.search_anchors IS
  'jsonb { proper_nouns: text[], topics: text[], dates_mentioned: text[], numbers: text[] }. The keyword-retrieval handles the chat agent uses to find this thread again.';
COMMENT ON COLUMN message_threads.summary_version IS
  'Bumped when the prompt schema changes in a way that should regenerate everything. Backfill endpoint reads this to decide what to re-summarize.';

COMMIT;
