-- Migration: Add AI Model Selection to Subjects
-- Description: Allows selecting a specific AI model for each subject.
--              This enables subject-specific AI model optimization (e.g., Claude for Maths, Gemini for English)
-- Date: 2026-01-09
--
-- Hierarchy of AI Model Selection:
-- 1. Subject-specific AI model (if set on the subject)
-- 2. User's tier default AI model (configured in subscription tier)
-- 3. System default AI model (is_default = true)

-- =====================================================
-- 1. ADD AI_MODEL_ID COLUMN TO SUBJECTS TABLE
-- =====================================================

ALTER TABLE subjects
ADD COLUMN ai_model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL;

-- Add comment explaining the column
COMMENT ON COLUMN subjects.ai_model_id IS 'Optional AI model preference for this subject. When set, this model will be used for processing exam papers and answering questions for this subject. If NULL, the system will fall back to the user''s tier default or system default.';

-- =====================================================
-- 2. CREATE INDEX FOR PERFORMANCE
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_subjects_ai_model_id ON subjects(ai_model_id);

-- =====================================================
-- 3. ADD HELPER FUNCTION TO GET SUBJECT AI MODEL
-- =====================================================

CREATE OR REPLACE FUNCTION get_subject_ai_model(p_subject_id UUID)
RETURNS TABLE (
  id UUID,
  provider TEXT,
  model_name TEXT,
  display_name TEXT,
  api_endpoint TEXT,
  temperature_default DECIMAL(3, 2),
  max_output_tokens INTEGER,
  supports_vision BOOLEAN,
  supports_caching BOOLEAN,
  input_token_cost_per_million DECIMAL(10, 4),
  output_token_cost_per_million DECIMAL(10, 4),
  token_multiplier DECIMAL(4, 2)
) AS $$
BEGIN
  -- Return the subject's specific AI model if set and active
  RETURN QUERY
  SELECT
    m.id,
    m.provider,
    m.model_name,
    m.display_name,
    m.api_endpoint,
    m.temperature_default,
    m.max_output_tokens,
    m.supports_vision,
    m.supports_caching,
    m.input_token_cost_per_million,
    m.output_token_cost_per_million,
    m.token_multiplier
  FROM subjects s
  JOIN ai_models m ON m.id = s.ai_model_id
  WHERE s.id = p_subject_id
    AND m.is_active = true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment on the function
COMMENT ON FUNCTION get_subject_ai_model IS 'Returns the AI model configuration for a specific subject if one is assigned and active. Returns empty if no model is assigned or if the model is inactive.';

-- =====================================================
-- 4. VERIFICATION QUERY
-- =====================================================

-- Query to verify the migration:
-- SELECT
--   s.name as subject_name,
--   m.display_name as ai_model,
--   m.provider,
--   m.token_multiplier
-- FROM subjects s
-- LEFT JOIN ai_models m ON m.id = s.ai_model_id
-- ORDER BY s.name;
