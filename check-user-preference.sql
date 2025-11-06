-- STEP 1: Find your user ID
-- Replace 'your-email@example.com' with your actual email
SELECT
  id as user_id,
  email,
  created_at
FROM auth.users
WHERE email = 'your-email@example.com';

-- Copy the user_id from the result above, then run:

-- STEP 2: Check your profile and AI model preference
-- Replace 'YOUR_USER_ID' with the ID from step 1
SELECT
  p.id,
  p.email,
  p.preferred_ai_model_id,
  am.provider,
  am.model_name,
  am.display_name,
  am.is_active
FROM profiles p
LEFT JOIN ai_models am ON am.id = p.preferred_ai_model_id
WHERE p.id = 'YOUR_USER_ID';

-- STEP 3: Test the get_user_ai_model function
-- Replace 'YOUR_USER_ID' again
SELECT * FROM get_user_ai_model('YOUR_USER_ID');

-- STEP 4: Check if Claude models exist and are active
SELECT
  id,
  provider,
  model_name,
  display_name,
  is_active
FROM ai_models
WHERE provider = 'claude';
