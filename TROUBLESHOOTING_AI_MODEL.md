# Troubleshooting: AI Model Not Being Used

If you selected Claude in your settings but the chat assistant is still using Gemini, follow this guide.

## Quick Diagnosis Checklist

- [ ] Edge function deployed with latest code
- [ ] Claude API key set in Supabase secrets
- [ ] User preference saved in database
- [ ] Function logs show correct model
- [ ] Recent token usage shows Claude provider

---

## Step-by-Step Debugging

### 1️⃣ Verify Your Preference is Saved

**Run this in Supabase SQL Editor:**

```sql
-- Replace 'your-email@example.com' with your actual email
SELECT
  p.id as user_id,
  p.email,
  p.preferred_ai_model_id,
  am.provider,
  am.model_name,
  am.display_name,
  am.is_active
FROM profiles p
LEFT JOIN ai_models am ON am.id = p.preferred_ai_model_id
WHERE p.email = 'your-email@example.com';
```

**Expected Result:**
```
user_id   | email              | preferred_ai_model_id | provider | model_name                    | display_name      | is_active
----------|--------------------|-----------------------|----------|-------------------------------|-------------------|----------
abc-123   | you@example.com    | xyz-789              | claude   | claude-3-5-haiku-20241022     | Claude 3.5 Haiku  | true
```

**If NULL:** Your preference wasn't saved. Try selecting it again in Settings.

**If Gemini:** You selected Gemini, not Claude. Go to Settings and select Claude.

**If is_active = false:** The model is deactivated. Run:
```sql
UPDATE ai_models SET is_active = true WHERE model_name = 'claude-3-5-haiku-20241022';
```

---

### 2️⃣ Test the get_user_ai_model Function

**Run this (replace YOUR_USER_ID):**

```sql
-- Get your user_id from step 1, then run:
SELECT * FROM get_user_ai_model('YOUR_USER_ID');
```

**Expected Result:**
```
model_id | provider | model_name                 | display_name     | supports_vision | supports_caching
---------|----------|----------------------------|------------------|-----------------|------------------
xyz-789  | claude   | claude-3-5-haiku-20241022  | Claude 3.5 Haiku | true           | true
```

**If it returns Gemini:** There's an issue with the function. Check if the preferred_ai_model_id is actually set in your profile.

**If it returns nothing:** The function might have an error. Check Supabase logs.

---

### 3️⃣ Verify Edge Function Deployment

```bash
# 1. Pull latest code
git pull origin claude/study-plan-grade-selection-011CUqB5D5w5tkQJriKMUnCC

# 2. Deploy the function
supabase functions deploy exam-assistant

# Should output:
# Deploying exam-assistant (project ref: ...)
# Deployed exam-assistant

# 3. Check it's listed
supabase functions list

# Should show exam-assistant in the list
```

---

### 4️⃣ Verify API Key is Set

```bash
# Check if Claude API key is set
supabase secrets list
```

**Expected output should include:**
```
ANTHROPIC_API_KEY
```

**If not present:**
```bash
# Set the API key
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key-here

# Redeploy function (required after setting secrets)
supabase functions deploy exam-assistant
```

**Get an API key:**
1. Go to https://console.anthropic.com/
2. Sign up or log in
3. Navigate to API Keys
4. Create new key
5. Copy the key (starts with `sk-ant-`)

---

### 5️⃣ Check Function Logs (MOST IMPORTANT)

This will tell you exactly what's happening:

```bash
# Start watching logs
supabase functions logs exam-assistant --tail

# Now go to your app and ask a question in the chat

# You should see logs like this:
```

**✅ CORRECT (Claude is being used):**
```
🤖 Fetching user's preferred AI model...
✅ Using AI model: Claude 3.5 Haiku (claude)
   - Model: claude-3-5-haiku-20241022
   - Supports Vision: true
   - Supports Caching: true
🌐 Using CLAUDE provider (no Gemini-specific caching)
✅ CLAUDE response received
📊 Tokens: 1234 input + 567 output = 1801 total
```

**❌ WRONG (Still using Gemini):**
```
🤖 Fetching user's preferred AI model...
📋 No user preference found, using default model
✅ Using AI model: Gemini 2.0 Flash (gemini)
```

**If you see "No user preference found":**
- Your userId isn't being passed to the function
- Or your preference isn't saved in the database

---

### 6️⃣ Check Recent Token Usage

```sql
-- Check what provider was actually used
SELECT
  created_at,
  provider,
  model,
  total_tokens,
  estimated_cost
FROM token_usage_logs
WHERE user_id = 'YOUR_USER_ID'  -- Replace with your user ID
ORDER BY created_at DESC
LIMIT 5;
```

**Expected (if Claude was used):**
```
created_at           | provider | model                      | total_tokens | estimated_cost
---------------------|----------|----------------------------|--------------|---------------
2025-11-06 10:30:00  | claude   | claude-3-5-haiku-20241022  | 1801        | 0.003502
```

**If you see `gemini`:** Claude isn't being used. Go back to step 5.

---

## Common Issues & Solutions

### Issue 1: "No user preference found"

**Cause:** Your preference wasn't saved or userId isn't being passed.

**Solution:**
1. Go to Settings → AI Model Preference
2. Select Claude again and wait for "AI model preference updated successfully"
3. Verify with Step 1 SQL query

### Issue 2: "Claude API key not configured"

**Cause:** ANTHROPIC_API_KEY environment variable not set.

**Solution:**
```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-your-key
supabase functions deploy exam-assistant
```

### Issue 3: "Failed to bundle the function"

**Cause:** Missing ai-providers.ts file in function directory.

**Solution:**
```bash
git pull  # Get latest code with the fix
supabase functions deploy exam-assistant
```

### Issue 4: Model selection saves but function still uses Gemini

**Cause:** Edge function not deployed or old version cached.

**Solution:**
```bash
# Force redeploy
supabase functions deploy exam-assistant --no-verify-jwt

# Clear browser cache and try again
```

---

## Testing Steps

After fixing any issues, test with these steps:

1. **Clear browser cache** (or open incognito window)
2. **Log in to your app**
3. **Open browser DevTools** (F12) → Network tab
4. **Go to Settings** → Verify Claude is selected
5. **Go to an exam paper** and ask a question
6. **Watch function logs:**
   ```bash
   supabase functions logs exam-assistant --tail
   ```
7. **Check the Network tab** - look at the exam-assistant request/response
8. **Verify token_usage_logs:**
   ```sql
   SELECT provider, model FROM token_usage_logs ORDER BY created_at DESC LIMIT 1;
   ```

---

## Still Not Working?

If you've tried everything above and Claude still isn't being used:

1. **Check function response in browser DevTools:**
   - Go to Network tab
   - Find the exam-assistant request
   - Look at the response - it should show `"provider": "claude"`

2. **Verify the function has the latest code:**
   ```bash
   # Check the function's imports
   supabase functions download exam-assistant
   # Look for: import { generateAIResponse, getUserAIModel... } from "./ai-providers.ts"
   ```

3. **Try creating a new profile:**
   - Create a test user
   - Set Claude as preference
   - Test if it works for the new user
   - If it works: Your original profile might have cached data

4. **Check browser console for errors:**
   - F12 → Console tab
   - Look for any red errors related to Settings or API calls

---

## Debug Commands Summary

```bash
# 1. Check deployment
supabase functions list

# 2. Watch logs
supabase functions logs exam-assistant --tail

# 3. Check secrets
supabase secrets list

# 4. Redeploy
supabase functions deploy exam-assistant

# 5. Test database function
# (Run in SQL Editor)
SELECT * FROM get_user_ai_model('YOUR_USER_ID');
```

---

## Success Indicators

You'll know Claude is working when:

✅ Function logs show: `Using AI model: Claude 3.5 Haiku (claude)`
✅ Function logs show: `CLAUDE response received`
✅ Response includes: `"provider": "claude"`
✅ Token usage logs show: `provider = 'claude'`
✅ Costs are ~1.5-2x higher than Gemini (expected for Claude)

---

## Contact Support

If none of this works, gather this information:

1. Screenshot of your Settings → AI Model Preference
2. Result of Step 1 SQL query
3. Function logs from Step 5
4. Recent token_usage_logs query result
5. Browser console errors (if any)

Then check the issue tracker or ask for help!
