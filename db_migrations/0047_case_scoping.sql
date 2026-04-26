-- Migration: 0047_case_scoping
-- Description: Add case_id to events / evidence / journal_entries / action_items /
--              evidence_mentions. Backfill from each user's most-recent case
--              (auto-creating "My case" for any user that has resources but no case row).
--              Adds case-keyed SELECT policies alongside the existing user_id ALL policies
--              (the user_id policies stay in place; Plan 03 will replace them with policies
--              that also grant access to case_collaborators).
--
-- Pre-flight (dry-run, run 2026-04-26):
--   1 user needs a case row inserted.
--   0 events / evidence / journal_entries / action_items / evidence_mentions
--     would be left with NULL case_id after the backfill.
--
-- Safety: every step is idempotent (re-runnable). The NOT NULL ALTER takes a
-- brief table lock; total table sizes are small (< 1k rows per table) so the
-- lock window is negligible.

BEGIN;

-- ============================================================
-- 1. Auto-create a "My case" row for any user with resources but no case.
--    Idempotent: WHERE NOT EXISTS skips users who already have a case.
-- ============================================================

INSERT INTO cases (user_id, title)
SELECT DISTINCT user_id, 'My case'
FROM (
  SELECT user_id FROM events
  UNION SELECT user_id FROM evidence
  UNION SELECT user_id FROM journal_entries
  UNION SELECT user_id FROM action_items
  UNION SELECT user_id FROM evidence_mentions
) sub
WHERE NOT EXISTS (
  SELECT 1 FROM cases c WHERE c.user_id = sub.user_id
);

-- ============================================================
-- 2. Add nullable case_id columns. ON DELETE CASCADE so deleting a case
--    cascades through every case-scoped resource.
-- ============================================================

ALTER TABLE events            ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES cases(id) ON DELETE CASCADE;
ALTER TABLE evidence          ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES cases(id) ON DELETE CASCADE;
ALTER TABLE journal_entries   ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES cases(id) ON DELETE CASCADE;
ALTER TABLE action_items      ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES cases(id) ON DELETE CASCADE;
ALTER TABLE evidence_mentions ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES cases(id) ON DELETE CASCADE;

-- ============================================================
-- 3. Backfill: assign every existing row to the user's most-recently-created case.
--    DISTINCT ON picks one case per user, ordered by created_at DESC.
-- ============================================================

WITH primary_case AS (
  SELECT DISTINCT ON (user_id) user_id, id AS case_id
  FROM cases
  ORDER BY user_id, created_at DESC
)
UPDATE events e SET case_id = pc.case_id
FROM primary_case pc
WHERE e.user_id = pc.user_id AND e.case_id IS NULL;

WITH primary_case AS (
  SELECT DISTINCT ON (user_id) user_id, id AS case_id
  FROM cases ORDER BY user_id, created_at DESC
)
UPDATE evidence ev SET case_id = pc.case_id
FROM primary_case pc
WHERE ev.user_id = pc.user_id AND ev.case_id IS NULL;

WITH primary_case AS (
  SELECT DISTINCT ON (user_id) user_id, id AS case_id
  FROM cases ORDER BY user_id, created_at DESC
)
UPDATE journal_entries je SET case_id = pc.case_id
FROM primary_case pc
WHERE je.user_id = pc.user_id AND je.case_id IS NULL;

WITH primary_case AS (
  SELECT DISTINCT ON (user_id) user_id, id AS case_id
  FROM cases ORDER BY user_id, created_at DESC
)
UPDATE action_items ai SET case_id = pc.case_id
FROM primary_case pc
WHERE ai.user_id = pc.user_id AND ai.case_id IS NULL;

WITH primary_case AS (
  SELECT DISTINCT ON (user_id) user_id, id AS case_id
  FROM cases ORDER BY user_id, created_at DESC
)
UPDATE evidence_mentions em SET case_id = pc.case_id
FROM primary_case pc
WHERE em.user_id = pc.user_id AND em.case_id IS NULL;

-- ============================================================
-- 4. Lock down core tables. action_items + evidence_mentions stay nullable
--    so future inserts that aren't tied to a case (e.g. orphaned action items)
--    still work. events / evidence / journal_entries are always case-scoped.
-- ============================================================

ALTER TABLE events          ALTER COLUMN case_id SET NOT NULL;
ALTER TABLE evidence        ALTER COLUMN case_id SET NOT NULL;
ALTER TABLE journal_entries ALTER COLUMN case_id SET NOT NULL;

-- ============================================================
-- 5. Indexes. Every case-scoped query goes through these.
--    primary_timestamp on events is nullable; place NULLs LAST for desc sort.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_events_case_id_timestamp
  ON events (case_id, primary_timestamp DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_evidence_case_id_created
  ON evidence (case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_journal_entries_case_id_created
  ON journal_entries (case_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_action_items_case_id_status
  ON action_items (case_id, status, deadline NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_evidence_mentions_case_id
  ON evidence_mentions (case_id);

-- ============================================================
-- 6. RLS. Add case-keyed SELECT policies alongside the existing
--    "Users can manage own X" ALL policies. Both PERMISSIVE policies OR together,
--    so single-user behavior is unchanged. Plan 03 will extend the case-keyed
--    side to also accept case_collaborators.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'events' AND policyname = 'events_select_via_case'
  ) THEN
    CREATE POLICY events_select_via_case ON events
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM cases c WHERE c.id = events.case_id AND c.user_id = (SELECT auth.uid()))
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'evidence' AND policyname = 'evidence_select_via_case'
  ) THEN
    CREATE POLICY evidence_select_via_case ON evidence
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM cases c WHERE c.id = evidence.case_id AND c.user_id = (SELECT auth.uid()))
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'journal_entries' AND policyname = 'journal_entries_select_via_case'
  ) THEN
    CREATE POLICY journal_entries_select_via_case ON journal_entries
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM cases c WHERE c.id = journal_entries.case_id AND c.user_id = (SELECT auth.uid()))
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'action_items' AND policyname = 'action_items_select_via_case'
  ) THEN
    CREATE POLICY action_items_select_via_case ON action_items
      FOR SELECT USING (
        case_id IS NULL
        OR EXISTS (SELECT 1 FROM cases c WHERE c.id = action_items.case_id AND c.user_id = (SELECT auth.uid()))
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'evidence_mentions' AND policyname = 'evidence_mentions_select_via_case'
  ) THEN
    CREATE POLICY evidence_mentions_select_via_case ON evidence_mentions
      FOR SELECT USING (
        case_id IS NULL
        OR EXISTS (SELECT 1 FROM cases c WHERE c.id = evidence_mentions.case_id AND c.user_id = (SELECT auth.uid()))
      );
  END IF;
END
$$;

-- ============================================================
-- 7. Comments for future readers.
-- ============================================================

COMMENT ON COLUMN events.case_id            IS 'Case this event belongs to. Required. Backfilled in 0047.';
COMMENT ON COLUMN evidence.case_id          IS 'Case this evidence belongs to. Required. Backfilled in 0047.';
COMMENT ON COLUMN journal_entries.case_id   IS 'Case this journal entry belongs to. Required. Backfilled in 0047.';
COMMENT ON COLUMN action_items.case_id      IS 'Case this action item belongs to. Nullable for orphaned action items.';
COMMENT ON COLUMN evidence_mentions.case_id IS 'Case this evidence mention belongs to. Nullable for orphaned mentions.';

COMMIT;
