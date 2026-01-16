-- Migration: Configure Storage Policies for Inserts Bucket
-- Description: Sets up Row-Level Security policies for the 'inserts' storage bucket
--              to allow admins to upload and everyone to read insert PDFs and images
-- Date: 2026-01-09

-- =====================================================
-- STORAGE POLICIES FOR 'INSERTS' BUCKET
-- =====================================================

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Allow authenticated users to upload inserts" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to inserts" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to update inserts" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated users to delete inserts" ON storage.objects;

-- Policy 1: Allow authenticated users to upload inserts
-- This allows admins to upload insert PDFs and the service role to upload insert images
CREATE POLICY "Allow authenticated users to upload inserts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'inserts'
);

-- Policy 2: Allow public read access to inserts
-- This allows students to view insert images when querying questions
CREATE POLICY "Allow public read access to inserts"
ON storage.objects
FOR SELECT
TO public
USING (
  bucket_id = 'inserts'
);

-- Policy 3: Allow authenticated users to update inserts (for re-uploads)
CREATE POLICY "Allow authenticated users to update inserts"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'inserts'
)
WITH CHECK (
  bucket_id = 'inserts'
);

-- Policy 4: Allow authenticated users to delete inserts
CREATE POLICY "Allow authenticated users to delete inserts"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'inserts'
);

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Query to verify policies are set up correctly:
-- SELECT
--   policyname,
--   cmd as operation,
--   qual as using_expression,
--   with_check as with_check_expression
-- FROM pg_policies
-- WHERE tablename = 'objects'
--   AND policyname LIKE '%inserts%'
-- ORDER BY policyname;
