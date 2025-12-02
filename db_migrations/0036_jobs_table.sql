-- 0036_jobs_table.sql
-- Background jobs core schema
-- Phase 1: jobs table and realtime integration

-- Create enums for job status and type
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_status') THEN
    CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_type') THEN
    CREATE TYPE job_type AS ENUM ('journal_extraction', 'evidence_processing');
  END IF;
END
$$;

-- Core jobs table
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  type job_type NOT NULL,
  status job_status NOT NULL DEFAULT 'pending',
  journal_entry_id UUID REFERENCES journal_entries(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  result_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'jobs'
      AND policyname = 'Users can view own jobs'
  ) THEN
    CREATE POLICY "Users can view own jobs"
      ON jobs
      FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END
$$;

-- Enable Realtime for push notifications
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_publication
    WHERE pubname = 'supabase_realtime'
  ) THEN
    -- Add table to publication if not already present
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
    EXCEPTION
      WHEN duplicate_object THEN
        -- Table already in publication; ignore
        NULL;
    END;
  END IF;
END
$$;

-- Index to efficiently query jobs by user and status
CREATE INDEX IF NOT EXISTS idx_jobs_user_status ON jobs(user_id, status);


