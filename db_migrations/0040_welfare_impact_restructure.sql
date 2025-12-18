-- Migration: 0040_welfare_impact_restructure.sql
-- Description: Add new columns to capture structured welfare impact
--              (category, direction, severity) while preserving the
--              existing welfare_impact enum column on events.

-- =============================================================================
-- 1. Add welfare impact detail columns to events table
-- =============================================================================
-- These are intentionally plain text columns to allow the application
-- layer to evolve the allowed values over time without requiring a
-- PostgreSQL enum migration. The legacy welfare_impact enum remains
-- in place for backward compatibility.

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS welfare_category text;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS welfare_direction text;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS welfare_severity text;
