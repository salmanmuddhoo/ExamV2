-- Create table to store Gemini context cache metadata
-- This stores cache names/IDs when using Gemini's built-in caching system

CREATE TABLE IF NOT EXISTS gemini_cache_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_name TEXT UNIQUE NOT NULL,
  exam_paper_id UUID REFERENCES exam_papers(id) ON DELETE CASCADE,
  question_number TEXT,
  cache_type TEXT NOT NULL CHECK (cache_type IN ('question_context', 'full_paper')),

  -- Gemini cache details
  gemini_cache_name TEXT NOT NULL, -- The name returned by Gemini's caching API
  model TEXT NOT NULL DEFAULT 'gemini-2.0-flash-exp',

  -- Cache content metadata
  system_prompt TEXT,
  image_count INTEGER DEFAULT 0,
  marking_scheme_included BOOLEAN DEFAULT FALSE,

  -- Expiration and lifecycle
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  use_count INTEGER DEFAULT 0,

  -- Tracking
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT unique_cache_per_question UNIQUE(exam_paper_id, question_number, cache_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gemini_cache_exam_paper ON gemini_cache_metadata(exam_paper_id);
CREATE INDEX IF NOT EXISTS idx_gemini_cache_question ON gemini_cache_metadata(question_number);
CREATE INDEX IF NOT EXISTS idx_gemini_cache_expires ON gemini_cache_metadata(expires_at);
CREATE INDEX IF NOT EXISTS idx_gemini_cache_gemini_name ON gemini_cache_metadata(gemini_cache_name);

-- RLS Policies
ALTER TABLE gemini_cache_metadata ENABLE ROW LEVEL SECURITY;

-- Service role can read/write (edge functions)
CREATE POLICY "Service role full access"
  ON gemini_cache_metadata FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admins can view cache metadata for monitoring
CREATE POLICY "Admins can view cache metadata"
  ON gemini_cache_metadata FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Function to clean up expired caches
CREATE OR REPLACE FUNCTION cleanup_expired_gemini_caches()
RETURNS INTEGER AS $$
DECLARE
  v_deleted_count INTEGER := 0;
BEGIN
  -- Delete expired caches
  WITH deleted AS (
    DELETE FROM gemini_cache_metadata
    WHERE expires_at IS NOT NULL
      AND expires_at < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_deleted_count FROM deleted;

  RAISE NOTICE 'Cleaned up % expired Gemini caches', v_deleted_count;

  RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get or create cache for a question
CREATE OR REPLACE FUNCTION get_gemini_cache_for_question(
  p_exam_paper_id UUID,
  p_question_number TEXT,
  p_cache_type TEXT DEFAULT 'question_context'
)
RETURNS TABLE (
  cache_id UUID,
  gemini_cache_name TEXT,
  is_expired BOOLEAN,
  use_count INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    id,
    gemini_cache_metadata.gemini_cache_name,
    (expires_at IS NOT NULL AND expires_at < NOW()) as is_expired,
    gemini_cache_metadata.use_count
  FROM gemini_cache_metadata
  WHERE exam_paper_id = p_exam_paper_id
    AND question_number = p_question_number
    AND cache_type = p_cache_type
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment cache use count
CREATE OR REPLACE FUNCTION increment_cache_use_count(p_cache_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE gemini_cache_metadata
  SET
    use_count = use_count + 1,
    last_used_at = NOW()
  WHERE id = p_cache_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION cleanup_expired_gemini_caches() TO service_role;
GRANT EXECUTE ON FUNCTION get_gemini_cache_for_question(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION increment_cache_use_count(UUID) TO service_role;

-- Comments
COMMENT ON TABLE gemini_cache_metadata IS 'Stores metadata for Gemini context caches when using Gemini built-in caching';
COMMENT ON COLUMN gemini_cache_metadata.cache_name IS 'Unique name for the cache (e.g., exam_paper_123_q5)';
COMMENT ON COLUMN gemini_cache_metadata.gemini_cache_name IS 'The cache name/ID returned by Gemini API';
COMMENT ON COLUMN gemini_cache_metadata.cache_type IS 'Type of cache: question_context or full_paper';
COMMENT ON FUNCTION cleanup_expired_gemini_caches() IS 'Deletes expired Gemini cache entries from database';
COMMENT ON FUNCTION get_gemini_cache_for_question(UUID, TEXT, TEXT) IS 'Get existing cache for a specific question';
