# Deploy Edge Functions to Supabase

## Prerequisites
- Make sure you have the Supabase CLI installed
- Make sure you're logged in to Supabase CLI

## Steps to Deploy

### 1. Check if you're logged in
```bash
npx supabase login
```

### 2. Link your project (if not already linked)
```bash
npx supabase link --project-ref xtgwncqaxwjyvjkczxjv
```

### 3. Deploy the exam-assistant function
```bash
npx supabase functions deploy exam-assistant
```

### 4. Deploy the process-exam-paper function (if changes were made)
```bash
npx supabase functions deploy process-exam-paper
```

## Alternative: Deploy all functions at once
```bash
npx supabase functions deploy
```

## Verify Deployment
After deployment, test the function by:
1. Going to the Supabase Dashboard
2. Navigate to Edge Functions
3. Check that the function shows as deployed
4. Test the function from your application

## Troubleshooting

### CORS Errors
- CORS errors usually mean the function hasn't been deployed yet
- Or there's a runtime error in the function preventing it from responding
- Check the function logs in Supabase Dashboard

### Authentication Errors
- Make sure GEMINI_API_KEY is set in function secrets
- Check that SUPABASE_SERVICE_ROLE_KEY is available

### Database Errors
- Make sure all migrations have been run
- Check that ai_prompts table exists
- Verify RLS policies are set correctly
