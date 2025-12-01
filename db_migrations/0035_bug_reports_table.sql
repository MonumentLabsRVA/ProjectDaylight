-- Bug Reports Table
-- Stores user-submitted bug reports and feedback
-- Accessible by both authenticated and anonymous users

-- Create enum for report status
CREATE TYPE bug_report_status AS ENUM ('new', 'triaged', 'in_progress', 'resolved', 'closed', 'wont_fix');

-- Create enum for report category
CREATE TYPE bug_report_category AS ENUM ('bug', 'feature_request', 'question', 'feedback', 'other');

-- Create the bug_reports table
CREATE TABLE public.bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- User info (required - authenticated users only)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT, -- Captured from auth for follow-up
  
  -- Report content
  category bug_report_category NOT NULL DEFAULT 'bug',
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  
  -- Technical context (auto-captured)
  page_url TEXT,
  user_agent TEXT,
  
  -- Admin fields
  status bug_report_status NOT NULL DEFAULT 'new',
  admin_notes TEXT,
  resolved_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add comment
COMMENT ON TABLE public.bug_reports IS 'User-submitted bug reports and feedback. Requires authentication.';

-- Create index for efficient queries
CREATE INDEX idx_bug_reports_user_id ON public.bug_reports(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_bug_reports_status ON public.bug_reports(status);
CREATE INDEX idx_bug_reports_created_at ON public.bug_reports(created_at DESC);
CREATE INDEX idx_bug_reports_category ON public.bug_reports(category);

-- Enable RLS
ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users can INSERT (submit bug reports)
CREATE POLICY "Authenticated users can submit bug reports"
  ON public.bug_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can view their own submissions
CREATE POLICY "Users can view own bug reports"
  ON public.bug_reports
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Policy: Employees can view all bug reports
CREATE POLICY "Employees can view all bug reports"
  ON public.bug_reports
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_employee = true
    )
  );

-- Policy: Employees can update bug reports (status, notes, etc.)
CREATE POLICY "Employees can update bug reports"
  ON public.bug_reports
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_employee = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.is_employee = true
    )
  );

-- Create trigger for updated_at
CREATE TRIGGER set_bug_reports_updated_at
  BEFORE UPDATE ON public.bug_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

