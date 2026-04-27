-- Migration: 0050_ofw_messages
-- Description: Creates the `messages` table — first-class storage for OFW message
-- exports. Plan 01 Phase 2.
--
-- Idempotent (CREATE TABLE / INDEX / POLICY / TRIGGER all guard with IF NOT EXISTS
-- or DO blocks).
--
-- Schema notes:
-- - case_id + user_id are both stored. case_id is the primary access path
--   (matches Plan 00's case-scoping); user_id is duplicated for fast user-level
--   queries and to match the existing audit-log shape.
-- - sequence_number is the parser's deterministic 1..N id within one upload.
--   Used for the dedupe unique index — message_number (the OFW-assigned
--   "Message X of Y") is nullable on non-primary thread replies, so it can't
--   serve as a unique key.
-- - The body GIN index supports Plan 02's search_messages tool.

BEGIN;

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evidence_id uuid NOT NULL REFERENCES public.evidence(id) ON DELETE CASCADE,
  sequence_number int NOT NULL,
  message_number int,
  sent_at timestamptz NOT NULL,
  first_viewed_at timestamptz,
  sender text NOT NULL,
  recipient text NOT NULL,
  subject text,
  body text NOT NULL,
  thread_id text,
  word_count int,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_messages_case_sent
  ON public.messages (case_id, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_messages_case_sender
  ON public.messages (case_id, sender);

CREATE INDEX IF NOT EXISTS idx_messages_evidence
  ON public.messages (evidence_id);

CREATE INDEX IF NOT EXISTS idx_messages_thread
  ON public.messages (case_id, thread_id, sent_at);

-- Dedupe: re-running the same Inngest job (or retry) must not double-insert.
-- sequence_number is the parser's deterministic 1..N id within a single upload.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_messages_evidence_sequence
  ON public.messages (evidence_id, sequence_number);

-- Full-text search on body (Plan 02 search_messages tool).
CREATE INDEX IF NOT EXISTS idx_messages_body_fts
  ON public.messages USING gin (to_tsvector('english', body));

-- ============================================================
-- RLS — owner-only via cases.user_id. messages is brand-new in this migration,
-- so a single FOR ALL policy is sufficient (no legacy user_id policy to layer
-- alongside, unlike events / evidence in 0047). Plan 03 will extend this policy
-- to also accept case_collaborators.
-- ============================================================

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'messages' AND policyname = 'messages_owner_via_case'
  ) THEN
    CREATE POLICY messages_owner_via_case ON public.messages
      FOR ALL USING (
        EXISTS (SELECT 1 FROM public.cases c WHERE c.id = messages.case_id AND c.user_id = (SELECT auth.uid()))
      ) WITH CHECK (
        EXISTS (SELECT 1 FROM public.cases c WHERE c.id = messages.case_id AND c.user_id = (SELECT auth.uid()))
      );
  END IF;
END
$$;

-- ============================================================
-- Audit log trigger — same record_audit() function used by events / evidence.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'audit_messages'
  ) THEN
    CREATE TRIGGER audit_messages
      AFTER INSERT OR UPDATE OR DELETE ON public.messages
      FOR EACH ROW EXECUTE FUNCTION public.record_audit();
  END IF;
END
$$;

-- ============================================================
-- Documentation
-- ============================================================

COMMENT ON TABLE public.messages IS
  'OFW (Our Family Wizard) message records parsed from PDF exports. One row per primary message; thread replies live as their own rows linked by thread_id.';
COMMENT ON COLUMN public.messages.sequence_number IS
  'Parser-assigned 1..N id within a single upload. Used for dedupe via uniq_messages_evidence_sequence so retries do not duplicate rows.';
COMMENT ON COLUMN public.messages.message_number IS
  'OFW-assigned "Message X of Y" number. Null for thread replies that did not get a top-level marker. Use this for export citations like "[OFW msg #N]".';

COMMIT;
