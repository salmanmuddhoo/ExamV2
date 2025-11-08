-- Add AI model and currency fields to subscription tiers
-- This allows each tier to have its own AI model and display currency

-- Add ai_model_id column to subscription_tiers
ALTER TABLE subscription_tiers
ADD COLUMN IF NOT EXISTS ai_model_id UUID REFERENCES ai_models(id) ON DELETE SET NULL;

-- Add currency column to subscription_tiers
ALTER TABLE subscription_tiers
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';

-- Add comment for documentation
COMMENT ON COLUMN subscription_tiers.ai_model_id IS 'The AI model assigned to this subscription tier. Users on this tier will use this model by default.';
COMMENT ON COLUMN subscription_tiers.currency IS 'The currency to display for this tier (e.g., USD, EUR, MUR)';

-- Set default AI models for existing tiers
-- Gemini 2.0 Flash for Free tier
UPDATE subscription_tiers st
SET ai_model_id = (
  SELECT id FROM ai_models
  WHERE model_name = 'gemini-2.0-flash-exp'
  AND is_active = true
  LIMIT 1
)
WHERE st.name = 'free';

-- Gemini 2.0 Flash for Student tier
UPDATE subscription_tiers st
SET ai_model_id = (
  SELECT id FROM ai_models
  WHERE model_name = 'gemini-2.0-flash-exp'
  AND is_active = true
  LIMIT 1
)
WHERE st.name = 'student';

-- Claude 3.5 Sonnet for Pro tier (premium AI model for Pro users)
UPDATE subscription_tiers st
SET ai_model_id = (
  SELECT id FROM ai_models
  WHERE model_name = 'claude-3.5-sonnet'
  AND is_active = true
  LIMIT 1
)
WHERE st.name = 'pro';
