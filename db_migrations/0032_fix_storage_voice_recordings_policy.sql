-- 0032_fix_storage_voice_recordings_policy.sql
-- Project Daylight - Fix storage RLS policies for voice-recordings path
--
-- Issue: The deployed policies incorrectly use `name ~~ 'voice-recordings/'::text`
-- instead of `name ~~ 'voice-recordings/' || auth.uid()::text || '/%'`
-- This would allow any authenticated user to access ANY voice recording.
--
-- Fix: Drop and recreate all storage.objects policies with correct user-scoped paths.

-- Drop existing policies (note the suffix from Supabase's policy naming)
DROP POLICY IF EXISTS "Users can read files from their own folders s8oyqs_0" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete files from their own folders s8oyqs_0" ON storage.objects;
DROP POLICY IF EXISTS "Users can update files in their own folders s8oyqs_0" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload files to their own folders s8oyqs_0" ON storage.objects;

-- Also drop any without suffix (in case they exist)
DROP POLICY IF EXISTS "Users can read files from their own folders" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete files from their own folders" ON storage.objects;
DROP POLICY IF EXISTS "Users can update files in their own folders" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload files to their own folders" ON storage.objects;

-- Recreate SELECT policy with correct user-scoped paths
CREATE POLICY "Users can read files from their own folders"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'daylight-files'
  AND (
    name LIKE 'evidence/' || auth.uid()::text || '/%'
    OR name LIKE 'voice-recordings/' || auth.uid()::text || '/%'
  )
);

-- Recreate INSERT policy with correct user-scoped paths
CREATE POLICY "Users can upload files to their own folders"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'daylight-files'
  AND (
    name LIKE 'evidence/' || auth.uid()::text || '/%'
    OR name LIKE 'voice-recordings/' || auth.uid()::text || '/%'
  )
);

-- Recreate UPDATE policy with correct user-scoped paths
CREATE POLICY "Users can update files in their own folders"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'daylight-files'
  AND (
    name LIKE 'evidence/' || auth.uid()::text || '/%'
    OR name LIKE 'voice-recordings/' || auth.uid()::text || '/%'
  )
)
WITH CHECK (
  bucket_id = 'daylight-files'
  AND (
    name LIKE 'evidence/' || auth.uid()::text || '/%'
    OR name LIKE 'voice-recordings/' || auth.uid()::text || '/%'
  )
);

-- Recreate DELETE policy with correct user-scoped paths
CREATE POLICY "Users can delete files from their own folders"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'daylight-files'
  AND (
    name LIKE 'evidence/' || auth.uid()::text || '/%'
    OR name LIKE 'voice-recordings/' || auth.uid()::text || '/%'
  )
);

