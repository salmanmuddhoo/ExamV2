-- Restore storage read policy for exam-papers bucket
-- This allows all users (authenticated and anonymous) to view/download exam papers

-- Drop the policy if it exists (in case it was partially created)
DROP POLICY IF EXISTS "Anyone can view exam papers" ON storage.objects;

-- Recreate the read policy for exam-papers
CREATE POLICY "Anyone can view exam papers"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'exam-papers');

-- Verify other essential read policies exist
DROP POLICY IF EXISTS "Anyone can view marking schemes" ON storage.objects;
CREATE POLICY "Anyone can view marking schemes"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'marking-schemes');

DROP POLICY IF EXISTS "Allow public downloads" ON storage.objects;
CREATE POLICY "Allow public downloads"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'exam-questions');

-- Note: Write policies (INSERT/UPDATE/DELETE) remain admin-only for security
