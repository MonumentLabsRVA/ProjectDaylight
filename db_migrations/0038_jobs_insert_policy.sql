-- 0038_jobs_insert_policy.sql
-- Allow authenticated users to create job records for themselves
-- This fixes RLS errors when the API route /api/journal/submit
-- tries to insert into the jobs table using the user-scoped client.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'jobs'
      AND policyname = 'Users can create own jobs'
  ) THEN
    CREATE POLICY "Users can create own jobs"
      ON jobs
      FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;


