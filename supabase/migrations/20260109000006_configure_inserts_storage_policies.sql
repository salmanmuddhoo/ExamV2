-- Migration: Configure Storage Policies for Inserts Bucket
-- Description: Sets up Row-Level Security policies for the 'inserts' storage bucket
--              to allow admins to upload and everyone to read insert PDFs and images
-- Date: 2026-01-09

-- =====================================================
-- STORAGE POLICIES FOR 'INSERTS' BUCKET
-- =====================================================

-- Policy 1: Allow authenticated users to upload inserts
-- This allows admins to upload insert PDFs and the service role to upload insert images
INSERT INTO storage.policies (name, bucket_id, operation, definition)
VALUES (
  'Allow authenticated users to upload inserts',
  'inserts',
  'INSERT',
  '(auth.role() = ''authenticated'')'::text
)
ON CONFLICT (bucket_id, name) DO UPDATE
SET definition = '(auth.role() = ''authenticated'')'::text;

-- Policy 2: Allow public read access to inserts
-- This allows students to view insert images when querying questions
INSERT INTO storage.policies (name, bucket_id, operation, definition)
VALUES (
  'Allow public read access to inserts',
  'inserts',
  'SELECT',
  'true'::text
)
ON CONFLICT (bucket_id, name) DO UPDATE
SET definition = 'true'::text;

-- Policy 3: Allow authenticated users to update inserts (for re-uploads)
INSERT INTO storage.policies (name, bucket_id, operation, definition)
VALUES (
  'Allow authenticated users to update inserts',
  'inserts',
  'UPDATE',
  '(auth.role() = ''authenticated'')'::text
)
ON CONFLICT (bucket_id, name) DO UPDATE
SET definition = '(auth.role() = ''authenticated'')'::text;

-- Policy 4: Allow authenticated users to delete inserts
INSERT INTO storage.policies (name, bucket_id, operation, definition)
VALUES (
  'Allow authenticated users to delete inserts',
  'inserts',
  'DELETE',
  '(auth.role() = ''authenticated'')'::text
)
ON CONFLICT (bucket_id, name) DO UPDATE
SET definition = '(auth.role() = ''authenticated'')'::text;

-- =====================================================
-- VERIFICATION
-- =====================================================

-- Query to verify policies are set up correctly:
-- SELECT
--   name,
--   operation,
--   definition
-- FROM storage.policies
-- WHERE bucket_id = 'inserts'
-- ORDER BY operation;
