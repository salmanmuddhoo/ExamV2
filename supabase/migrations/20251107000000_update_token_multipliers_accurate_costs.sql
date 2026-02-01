-- Migration: Implement Cost-Based Token Consumption System
-- Description: Creates a system to adjust token consumption based on actual API costs
-- Date: 2025-11-07
--
-- This ensures that when users select more expensive models, they consume proportionally more
-- tokens from their allocation, keeping platform costs predictable.
--
-- Methodology: Instead of fixed multipliers, we calculate token consumption based on the
-- actual cost ratio compared to Gemini baseline. This accounts for varying input/output ratios.
--
-- Baseline reference: Gemini 2.5 Flash pricing (Updated Feb 2026)
-- - Input: $0.30 per 1M tokens
-- - Output: $2.50 per 1M tokens

-- =====================================================
-- 1. CREATE FUNCTION TO CALCULATE COST-BASED TOKEN CONSUMPTION
-- =====================================================

-- This function calculates how many tokens should be deducted from a user's allocation
-- based on the actual USD cost of the request compared to Gemini baseline cost.
CREATE OR REPLACE FUNCTION calculate_cost_based_token_consumption(
  p_actual_prompt_tokens INTEGER,
  p_actual_completion_tokens INTEGER,
  p_actual_cost DECIMAL(10, 6)
) RETURNS INTEGER AS $$
DECLARE
  v_baseline_input_cost CONSTANT DECIMAL(10, 4) := 0.30; -- Gemini 2.5 Flash input cost per 1M tokens
  v_baseline_output_cost CONSTANT DECIMAL(10, 4) := 2.50;  -- Gemini 2.5 Flash output cost per 1M tokens
  v_gemini_equivalent_cost DECIMAL(10, 6);
  v_cost_ratio DECIMAL(10, 4);
  v_adjusted_tokens INTEGER;
  v_total_actual_tokens INTEGER;
BEGIN
  -- Calculate total actual tokens
  v_total_actual_tokens := p_actual_prompt_tokens + p_actual_completion_tokens;

  -- Calculate what this request would have cost with Gemini
  v_gemini_equivalent_cost :=
    (p_actual_prompt_tokens / 1000000.0) * v_baseline_input_cost +
    (p_actual_completion_tokens / 1000000.0) * v_baseline_output_cost;

  -- Avoid division by zero
  IF v_gemini_equivalent_cost = 0 OR v_gemini_equivalent_cost IS NULL THEN
    RETURN v_total_actual_tokens;
  END IF;

  -- Calculate cost ratio (how much more expensive was this request compared to Gemini)
  v_cost_ratio := p_actual_cost / v_gemini_equivalent_cost;

  -- Calculate adjusted token consumption
  -- This represents "Gemini-equivalent tokens" that should be deducted from user allocation
  v_adjusted_tokens := CEIL(v_total_actual_tokens * v_cost_ratio);

  -- Log the calculation for debugging (will appear in Supabase logs)
  RAISE LOG 'Cost-based token calculation: actual_tokens=%, actual_cost=$%, gemini_cost=$%, ratio=%, adjusted_tokens=%',
    v_total_actual_tokens, p_actual_cost, v_gemini_equivalent_cost, v_cost_ratio, v_adjusted_tokens;

  RETURN v_adjusted_tokens;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION calculate_cost_based_token_consumption(INTEGER, INTEGER, DECIMAL) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_cost_based_token_consumption(INTEGER, INTEGER, DECIMAL) TO service_role;

-- Add comment
COMMENT ON FUNCTION calculate_cost_based_token_consumption IS 'Calculates adjusted token consumption based on actual cost ratio compared to Gemini baseline. This ensures platform costs remain predictable regardless of which model users choose, while accurately accounting for varying input/output token ratios.';

-- =====================================================
-- 2. UPDATE TOKEN_MULTIPLIERS FOR UI DISPLAY
-- =====================================================

-- These multipliers are used for UI display to give users an estimate
-- The actual token consumption uses the cost-based calculation above

-- Update Claude 3.5 Sonnet
UPDATE ai_models
SET
  token_multiplier = 40.0,
  description = 'Most intelligent model with superior reasoning. Consumes approximately 40-50x more tokens than Gemini depending on usage. Best for complex problem solving.',
  updated_at = NOW()
WHERE model_name = 'claude-3-5-sonnet-20241022';

-- Update Claude 3.5 Haiku
UPDATE ai_models
SET
  token_multiplier = 15.0,
  description = 'Fast and affordable model. Consumes approximately 15-20x more tokens than Gemini depending on usage. Good balance of speed and intelligence.',
  updated_at = NOW()
WHERE model_name = 'claude-3-5-haiku-20241022';

-- Update GPT-4o
UPDATE ai_models
SET
  token_multiplier = 30.0,
  description = 'OpenAI''s flagship multimodal model. Consumes approximately 30-35x more tokens than Gemini depending on usage. High quality responses.',
  updated_at = NOW()
WHERE model_name = 'gpt-4o';

-- Update GPT-4o Mini (already accurate)
UPDATE ai_models
SET
  token_multiplier = 2.0,
  description = 'Affordable and fast model with vision support. Consumes approximately 2x more tokens than Gemini. Good for most tasks.',
  updated_at = NOW()
WHERE model_name = 'gpt-4o-mini';

-- Update Gemini models to ensure baseline is clear
UPDATE ai_models
SET
  token_multiplier = 1.0,
  description = 'Fast and efficient model with vision support and built-in caching. Best balance of speed and quality. 1x token usage (baseline).',
  updated_at = NOW()
WHERE model_name = 'gemini-2.0-flash';

UPDATE ai_models
SET
  token_multiplier = 1.0,
  description = 'Experimental version with latest features. Used for study plan generation. 1x token usage (baseline).',
  updated_at = NOW()
WHERE model_name = 'gemini-2.0-flash-exp';

-- Add comment documenting the updated methodology
COMMENT ON COLUMN ai_models.token_multiplier IS 'Estimated token consumption multiplier relative to Gemini 2.0 Flash baseline (for UI display only). Actual token consumption is calculated dynamically based on real cost ratios to ensure accurate cost control.';
