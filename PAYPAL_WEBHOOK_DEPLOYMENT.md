# PayPal Webhook Deployment Guide

## Current Issue: 401 Unauthorized

Your PayPal webhooks are returning **401 Unauthorized** because the webhook function hasn't been deployed to Supabase yet.

## Immediate Fix - Deploy Webhook Function

### Step 1: Deploy the Function

Run this command in your project directory:

```bash
cd /home/user/ExamV2
npx supabase functions deploy paypal-webhook
```

### Step 2: Set Environment Variables

The function needs these environment variables to work:

```bash
# Required - Set these in Supabase Dashboard or via CLI
npx supabase secrets set PAYPAL_CLIENT_ID=your_paypal_client_id
npx supabase secrets set PAYPAL_SECRET=your_paypal_secret
npx supabase secrets set PAYPAL_MODE=sandbox
```

**Where to get these values:**
- `PAYPAL_CLIENT_ID`: From PayPal Developer Dashboard → Your App → Client ID
- `PAYPAL_SECRET`: From PayPal Developer Dashboard → Your App → Secret
- `PAYPAL_MODE`: Use `sandbox` for testing, `production` for live

### Step 3: Verify Deployment

After deploying, test the webhook:

1. Make a test payment through PayPal
2. Check PayPal Developer Dashboard → Webhooks → Event History
3. Look for your webhook - status should be **200 OK** (not 401)

### Step 4: Check Supabase Logs

View function logs to see if webhooks are being received:

```bash
npx supabase functions logs paypal-webhook --tail
```

Or in Supabase Dashboard:
- Go to **Edge Functions** → **paypal-webhook** → **Logs**

---

## Alternative: Deploy via Supabase Dashboard

If CLI doesn't work, you can deploy via the dashboard:

1. Go to your Supabase project dashboard
2. Click **Edge Functions** in sidebar
3. Click **Deploy new function**
4. Name: `paypal-webhook`
5. Upload the file: `supabase/functions/paypal-webhook/index.ts`
6. Deploy

---

## Why 401 Happens

Supabase Edge Functions are designed to be called from your frontend with authentication. However, PayPal webhooks come from PayPal's servers without any Supabase auth headers.

**The function handles this by:**
1. Not requiring Supabase authentication
2. Accepting all POST requests
3. (Optional) Verifying PayPal's webhook signature for security

Once deployed, the function will work without requiring auth headers from PayPal.

---

## Troubleshooting

### Still getting 401 after deployment?

1. **Check if function exists:**
   ```bash
   npx supabase functions list
   ```
   You should see `paypal-webhook` in the list

2. **Check function URL:**
   The webhook URL should be: `https://xtgwncqaxwjyvjkczxjv.supabase.co/functions/v1/paypal-webhook`

   Verify this matches your PayPal webhook configuration

3. **Check environment variables:**
   ```bash
   npx supabase secrets list
   ```
   Should show: `PAYPAL_CLIENT_ID`, `PAYPAL_SECRET`, `PAYPAL_MODE`

4. **Redeploy:**
   ```bash
   npx supabase functions deploy paypal-webhook --no-verify-jwt
   ```

### Webhook signature verification

For production, enable signature verification:

1. Edit `supabase/functions/paypal-webhook/index.ts`
2. Uncomment lines 58-74 (signature verification code)
3. Set `PAYPAL_WEBHOOK_ID`:
   ```bash
   npx supabase secrets set PAYPAL_WEBHOOK_ID=your_webhook_id_from_paypal
   ```
4. Redeploy

---

## Next Steps

After webhook is working:
1. ✅ Webhooks return 200 OK
2. ✅ Transactions appear in database
3. ✅ Subscription activates automatically
4. Consider implementing PayPal Subscriptions API for auto-recurring payments (see PAYPAL_RECURRING_SETUP.md)

---

**Need Help?**
- Check Supabase logs: Dashboard → Edge Functions → Logs
- Check PayPal webhook history: PayPal Dashboard → Webhooks → Event History
- Resend failed webhooks from PayPal dashboard for testing
