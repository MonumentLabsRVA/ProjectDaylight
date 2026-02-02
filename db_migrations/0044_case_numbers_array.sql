-- 0044_case_numbers_array.sql
-- Convert case_number from a single text value to an array to support multiple court case numbers
-- Run this in your Supabase project's SQL editor.

------------------------------------------------------------
-- Step 1: Add new column as text array
------------------------------------------------------------

alter table public.cases
  add column case_numbers text[] not null default '{}';

------------------------------------------------------------
-- Step 2: Migrate existing single values to the array
------------------------------------------------------------

update public.cases
set case_numbers = array[case_number]
where case_number is not null and case_number <> '';

------------------------------------------------------------
-- Step 3: Drop the old column
------------------------------------------------------------

alter table public.cases
  drop column case_number;

------------------------------------------------------------
-- Step 4: Rename new column to case_numbers (keeping plural)
-- Note: Keeping it as case_numbers (plural) to indicate it holds multiple values
------------------------------------------------------------

-- Column is already named case_numbers, no rename needed
