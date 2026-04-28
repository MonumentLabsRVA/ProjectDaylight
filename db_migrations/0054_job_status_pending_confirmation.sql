-- Migration: 0054_job_status_pending_confirmation
-- Description: Adds 'pending_confirmation' to the job_status enum so the
--   ofw-ingest pipeline can pause for user input when an upload looks
--   substantively different from the case's existing thread set (drift > 50%).
--   See Plan 20260428_smarter_chat_retrieval Sprint 6.
--
-- Postgres forbids using a freshly-added enum value in the same transaction
-- as the ALTER TYPE that adds it. Keep this migration on its own; the
-- ofw-ingest code that *uses* the value is application code (no DDL) so
-- there's no in-transaction issue there.
--
-- Idempotent — IF NOT EXISTS guard is safe to re-run.

ALTER TYPE job_status ADD VALUE IF NOT EXISTS 'pending_confirmation';
