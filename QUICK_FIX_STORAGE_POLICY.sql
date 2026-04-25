-- ⚡ QUICK FIX: Run this in Supabase SQL Editor NOW
-- This will immediately fix the exam papers not loading issue

-- Drop the policy if it exists
DROP POLICY IF EXISTS "Anyone can view exam papers" ON storage.objects;

-- Create the SELECT policy to allow viewing exam papers
CREATE POLICY "Anyone can view exam papers"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'exam-papers');

-- Verify it was created
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename = 'objects'
  AND policyname = 'Anyone can view exam papers';

-- You should see 1 row returned with the policy details
