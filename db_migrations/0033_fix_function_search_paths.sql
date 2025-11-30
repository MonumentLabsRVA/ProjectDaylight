-- 0033_fix_function_search_paths.sql
-- Project Daylight - Fix mutable search_path on database functions
--
-- Issue: Functions without explicit search_path are vulnerable to search path injection.
-- An attacker could create objects in a schema earlier in the search path to hijack function behavior.
--
-- Fix: Set search_path to empty string for all affected functions.
-- Reference: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

ALTER FUNCTION public.update_journal_entries_updated_at() SET search_path = '';
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';
ALTER FUNCTION public.update_subscriptions_updated_at() SET search_path = '';

