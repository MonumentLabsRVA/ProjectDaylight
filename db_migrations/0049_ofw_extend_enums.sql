-- Migration: 0049_ofw_extend_enums
-- Description: Adds the new enum values needed by Plan 01 (OFW ingest):
--   - evidence_source_type += 'ofw_export'   (the new evidence kind)
--   - job_type             += 'ofw_ingest'   (the parsing job kind)
--
-- Why split from 0050: PostgreSQL forbids using a freshly-added enum value in
-- the same transaction as the ALTER TYPE that adds it. Adding the values in
-- their own migration commits them before 0050 references them in defaults,
-- column types, or check constraints.
--
-- Both ALTER TYPE statements are idempotent (IF NOT EXISTS) so re-running is safe.

ALTER TYPE evidence_source_type ADD VALUE IF NOT EXISTS 'ofw_export';
ALTER TYPE job_type             ADD VALUE IF NOT EXISTS 'ofw_ingest';
