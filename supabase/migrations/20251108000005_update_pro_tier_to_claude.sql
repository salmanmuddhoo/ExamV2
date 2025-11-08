-- Update Pro tier to use Claude 3.5 Sonnet instead of Gemini
-- This migration updates the AI model for the Pro subscription tier

UPDATE subscription_tiers st
SET ai_model_id = (
  SELECT id FROM ai_models
  WHERE model_name = 'claude-3.5-sonnet'
  AND is_active = true
  LIMIT 1
)
WHERE st.name = 'pro';
