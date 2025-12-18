-- Migration: 0041_child_statements_coparent.sql
-- Description: Add JSONB columns for child statements, co-parent
--              interaction analysis, and structured patterns to the
--              events table to support richer custody-focused
--              extraction while keeping existing columns intact.

-- =============================================================================
-- 1. Add child_statements JSONB column
-- =============================================================================
-- Stores an array of child statement objects:
--   [{ statement, context, concerning }, ...]
-- Defaults to an empty array for existing and new rows.

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS child_statements jsonb NOT NULL DEFAULT '[]'::jsonb;

-- =============================================================================
-- 2. Add coparent_interaction JSONB column
-- =============================================================================
-- Stores an optional object describing tone analysis for co-parent
-- interactions:
--   { your_tone, their_tone, your_response_appropriate }

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS coparent_interaction jsonb;

-- =============================================================================
-- 3. Add patterns_noted_v2 JSONB column
-- =============================================================================
-- Stores an array of structured pattern objects:
--   [{ pattern_type, description, frequency }, ...]
-- Defaults to an empty array for existing and new rows, leaving the
-- legacy patterns/events linkage intact.

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS patterns_noted_v2 jsonb NOT NULL DEFAULT '[]'::jsonb;
