-- Debug Script: Check User's AI Model Preference

-- 1. Check if your profile has a preferred AI model set
SELECT
  p.id,
  p.email,
  p.preferred_ai_model_id,
  am.provider,
  am.model_name,
  am.display_name
FROM profiles p
LEFT JOIN ai_models am ON am.id = p.preferred_ai_model_id
WHERE p.email = 'YOUR_EMAIL_HERE'  -- Replace with your email
LIMIT 1;

-- 2. Check all AI models are active
SELECT
  provider,
  model_name,
  display_name,
  is_active,
  is_default
FROM ai_models
ORDER BY provider, model_name;

-- 3. Test the get_user_ai_model function with your user ID
-- Replace 'YOUR_USER_ID' with your actual user ID
SELECT * FROM get_user_ai_model('YOUR_USER_ID');

-- 4. Check recent token usage to see what model was actually used
SELECT
  tul.created_at,
  tul.provider,
  tul.model,
  tul.total_tokens,
  tul.user_id,
  p.email
FROM token_usage_logs tul
LEFT JOIN profiles p ON p.id = tul.user_id
WHERE tul.created_at > NOW() - INTERVAL '1 hour'
ORDER BY tul.created_at DESC
LIMIT 10;

-- 5. Check if ANTHROPIC_API_KEY is being used (check function logs)
-- Run this after making a request:
-- supabase functions logs exam-assistant --tail
