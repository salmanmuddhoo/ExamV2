-- Add delete policy for exam-questions storage bucket
-- Run this SQL in your Supabase dashboard SQL Editor

-- First, drop the policy if it already exists (in case of re-running)
DROP POLICY IF EXISTS "Admins can delete exam question images" ON storage.objects;

-- Create the delete policy for admins
CREATE POLICY "Admins can delete exam question images"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'exam-questions' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);
