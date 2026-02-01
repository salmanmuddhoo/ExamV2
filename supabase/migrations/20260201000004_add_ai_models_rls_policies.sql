-- Migration: Add RLS Policies for AI Models Table
-- Description: Adds Row Level Security policies to allow admins to manage AI models
-- Date: 2026-02-01

-- =====================================================
-- 1. DROP EXISTING POLICIES (if any)
-- =====================================================

DROP POLICY IF EXISTS "Anyone can view active AI models" ON ai_models;
DROP POLICY IF EXISTS "Admins can insert AI models" ON ai_models;
DROP POLICY IF EXISTS "Admins can update AI models" ON ai_models;
DROP POLICY IF EXISTS "Admins can delete AI models" ON ai_models;
DROP POLICY IF EXISTS "Authenticated users can view AI models" ON ai_models;

-- =====================================================
-- 2. CREATE SELECT POLICY (All authenticated users can view)
-- =====================================================

CREATE POLICY "Authenticated users can view AI models"
ON ai_models
FOR SELECT
TO authenticated
USING (true);

-- Allow service role full access (for edge functions)
CREATE POLICY "Service role can view AI models"
ON ai_models
FOR SELECT
TO service_role
USING (true);

-- =====================================================
-- 3. CREATE INSERT POLICY (Only admins can insert)
-- =====================================================

CREATE POLICY "Admins can insert AI models"
ON ai_models
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Service role can insert (for migrations and edge functions)
CREATE POLICY "Service role can insert AI models"
ON ai_models
FOR INSERT
TO service_role
WITH CHECK (true);

-- =====================================================
-- 4. CREATE UPDATE POLICY (Only admins can update)
-- =====================================================

CREATE POLICY "Admins can update AI models"
ON ai_models
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Service role can update
CREATE POLICY "Service role can update AI models"
ON ai_models
FOR UPDATE
TO service_role
USING (true)
WITH CHECK (true);

-- =====================================================
-- 5. CREATE DELETE POLICY (Only admins can delete)
-- =====================================================

CREATE POLICY "Admins can delete AI models"
ON ai_models
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);

-- Service role can delete
CREATE POLICY "Service role can delete AI models"
ON ai_models
FOR DELETE
TO service_role
USING (true);

-- =====================================================
-- 6. VERIFICATION
-- =====================================================

DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  -- Count policies on ai_models table
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE tablename = 'ai_models';

  IF policy_count < 8 THEN
    RAISE WARNING 'Expected at least 8 policies on ai_models table, found %', policy_count;
  ELSE
    RAISE NOTICE '✅ Successfully created % RLS policies for ai_models table', policy_count;
  END IF;
END $$;
