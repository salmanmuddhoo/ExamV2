#!/bin/bash

# Test AI Model Selection
# This script tests if your preferred AI model is being used

echo "🧪 Testing AI Model Selection..."
echo ""

# Get your user ID from Supabase
echo "1. First, get your user ID by running this SQL query:"
echo ""
echo "SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';"
echo ""
read -p "Enter your user ID: " USER_ID

echo ""
echo "2. Checking your AI model preference..."
echo ""

# Query the database
supabase db remote execute "
SELECT
  p.email,
  am.provider,
  am.model_name,
  am.display_name
FROM profiles p
LEFT JOIN ai_models am ON am.id = p.preferred_ai_model_id
WHERE p.id = '$USER_ID';
"

echo ""
echo "3. Now, go to your app and ask a question in the chat."
echo "4. Then check the function logs:"
echo ""
echo "   supabase functions logs exam-assistant --tail"
echo ""
echo "5. Look for this line:"
echo "   ✅ Using AI model: Claude 3.5 Haiku (claude)"
echo ""
echo "If you see Gemini instead of Claude, there's an issue."
