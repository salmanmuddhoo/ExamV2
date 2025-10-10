-- Add delete policy for exam-questions storage bucket
-- This allows admins to delete question images when deleting exam papers

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
