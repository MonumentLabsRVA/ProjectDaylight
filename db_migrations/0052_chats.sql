-- Migration: 0052_chats
-- Description: Plan 02 / Sift integration — case-scoped chat panel.
--   chats holds a UIMessage[] (jsonb) per conversation, scoped to a single
--   case. RLS mirrors events/evidence/messages: a user can read/write their
--   own chats by virtue of owning the case. Plan 03 will extend the SELECT
--   policy to cover collaborators.

BEGIN;

CREATE TABLE chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text DEFAULT '',
  agent text DEFAULT 'case_assistant',
  messages jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_chats_case_updated ON chats (case_id, updated_at DESC);
CREATE INDEX idx_chats_user ON chats (user_id);

ALTER TABLE chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY chats_owner_select ON chats
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM cases c WHERE c.id = chats.case_id AND c.user_id = auth.uid())
  );

CREATE POLICY chats_owner_modify ON chats
  FOR ALL USING (
    EXISTS (SELECT 1 FROM cases c WHERE c.id = chats.case_id AND c.user_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM cases c WHERE c.id = chats.case_id AND c.user_id = auth.uid())
  );

CREATE TRIGGER chats_set_updated_at
  BEFORE UPDATE ON chats
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
