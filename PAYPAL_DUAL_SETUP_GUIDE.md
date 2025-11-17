# PayPal Dual Payment Setup Guide
## One-Time + Recurring Subscriptions

This guide walks you through setting up BOTH one-time and recurring PayPal payments, giving your users a choice.

---

## Overview

**What You're Building:**
- ✅ One-time payments (manual renewal each period)
- ✅ Auto-recurring subscriptions (automatic renewal)
- ✅ User choice between payment types
- ✅ Single PayPal integration supporting both

**Benefits:**
- User flexibility - some prefer manual control
- Better retention - recurring users don't forget to renew
- Gradual migration - can incentivize recurring later
- Lower risk - keeps existing one-time payment working

---

## Prerequisites

- PayPal Developer Account
- Supabase project set up
- Node.js installed (for setup script)
- Access to your database

---

## Step 1: Create PayPal Subscription Plans

### 1.1 Install Dependencies

```bash
cd /home/user/ExamV2
npm install node-fetch
```

### 1.2 Configure the Setup Script

Edit `scripts/setup-paypal-plans.js`:

```javascript
const CONFIG = {
  // Get these from PayPal Developer Dashboard
  PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID || 'your_client_id',
  PAYPAL_SECRET: process.env.PAYPAL_SECRET || 'your_secret',

  // Use 'sandbox' for testing
  MODE: 'sandbox',

  // Your domain
  HOME_URL: 'https://yourdomain.com',
  IMAGE_URL: 'https://yourdomain.com/logo.png',

  // Update these prices to match your tiers
  PLANS: [
    {
      tier_name: 'student',
      tier_display_name: 'Student',
      billing_cycle: 'monthly',
      price: '10.00',
      description: 'Monthly subscription for Student tier'
    },
    {
      tier_name: 'student',
      tier_display_name: 'Student',
      billing_cycle: 'yearly',
      price: '100.00',
      description: 'Yearly subscription for Student tier (save 17%)'
    },
    // Add more plans for other tiers...
  ]
};
```

**Where to get PayPal credentials:**
1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/)
2. Navigate to **My Apps & Credentials** → **Sandbox** tab
3. Click on your app (or create one)
4. Copy **Client ID** and **Secret**

### 1.3 Run the Setup Script

```bash
# Set environment variables (recommended)
export PAYPAL_CLIENT_ID=your_client_id
export PAYPAL_SECRET=your_secret
export PAYPAL_MODE=sandbox

# Run the script
node scripts/setup-paypal-plans.js
```

**Expected Output:**
```
🚀 PayPal Subscription Plans Setup
================================================================================
Mode: SANDBOX
API Base: https://api.sandbox.paypal.com
Plans to create: 4
================================================================================

🔐 Getting access token from PayPal (sandbox mode)...
✅ Access token obtained

📦 Creating product in PayPal...
✅ Product created: PROD-XXXXXXXXXXXXX
   Name: Exam Study Assistant Subscription

📋 Creating plan: Student monthly...
✅ Plan created and activated: P-XXXXXXXXXXXXX
   Name: Student Monthly Subscription
   Price: $10.00 USD per month

... (more plans)

✅ SUCCESS! All plans created
================================================================================
```

### 1.4 Save the SQL Output

The script will output SQL statements. **Copy them** - you'll need them in the next step.

---

## Step 2: Update Database

### 2.1 Run the Migration

In your Supabase SQL Editor, run:

```bash
# Or apply via Supabase CLI
npx supabase db push
```

The migration file is already created at:
`supabase/migrations/20251117000001_add_paypal_subscriptions.sql`

This creates:
- `paypal_subscription_plans` table
- `payment_type` column in `payment_transactions`
- `paypal_subscription_id` column
- Necessary indexes and RLS policies

### 2.2 Insert Plan Mappings

Run the SQL output from Step 1.3 in your Supabase SQL Editor:

```sql
-- Insert PayPal plan mappings
INSERT INTO paypal_subscription_plans (tier_id, billing_cycle, paypal_plan_id, price, currency)
VALUES (
  (SELECT id FROM subscription_tiers WHERE name = 'student'),
  'monthly',
  'P-XXXXXXXXXXXXX', -- Replace with actual Plan ID from script
  10.00,
  'USD'
)
ON CONFLICT (tier_id, billing_cycle)
DO UPDATE SET
  paypal_plan_id = EXCLUDED.paypal_plan_id,
  price = EXCLUDED.price,
  updated_at = NOW();

-- Repeat for all plans...
```

### 2.3 Verify Plan Insertion

```sql
SELECT
  st.name AS tier_name,
  psp.billing_cycle,
  psp.paypal_plan_id,
  psp.price,
  psp.is_active
FROM paypal_subscription_plans psp
JOIN subscription_tiers st ON st.id = psp.tier_id
ORDER BY st.name, psp.billing_cycle;
```

You should see all your plans listed.

---

## Step 3: Update Frontend

### 3.1 Use the New Dual Payment Component

Update `src/components/PaymentOrchestrator.tsx`:

```typescript
// Replace the import
import { PayPalPaymentDual } from './PayPalPaymentDual';

// Replace the PayPal payment section
if (step === 'paypal' && selectedPaymentMethod) {
  return (
    <PayPalPaymentDual
      paymentData={paymentData}
      paymentMethod={selectedPaymentMethod}
      onBack={handleBackToMethods}
      onSuccess={onSuccess}
      hideBackButton={hideBackButton}
      couponData={couponData}
    />
  );
}
```

### 3.2 Test the UI

Build and run your app:

```bash
npm run dev
```

Navigate to subscription page and select PayPal:
1. You should see a choice screen: "One-Time Payment" vs "Auto-Renewing Subscription"
2. Selecting either option should show the appropriate PayPal button
3. One-time should show "Pay Now" button
4. Recurring should show "Subscribe" button

---

## Step 4: Update Webhook Handler

### 4.1 Webhook is Already Updated

The webhook handler at `supabase/functions/paypal-webhook/index.ts` has been updated to handle:

**One-Time Payment Events:**
- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.CAPTURE.DENIED`
- `PAYMENT.CAPTURE.REFUNDED`

**Recurring Subscription Events:**
- `BILLING.SUBSCRIPTION.CREATED`
- `BILLING.SUBSCRIPTION.ACTIVATED`
- `BILLING.SUBSCRIPTION.CANCELLED`
- `BILLING.SUBSCRIPTION.SUSPENDED`
- `BILLING.SUBSCRIPTION.EXPIRED`
- `PAYMENT.SALE.COMPLETED` (recurring payments)

### 4.2 Deploy Webhook Function

```bash
npx supabase functions deploy paypal-webhook
```

### 4.3 Set Environment Variables

```bash
npx supabase secrets set PAYPAL_CLIENT_ID=your_client_id
npx supabase secrets set PAYPAL_SECRET=your_secret
npx supabase secrets set PAYPAL_MODE=sandbox
```

---

## Step 5: Configure PayPal Webhooks

### 5.1 Add Subscription Event Types

1. Go to [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/)
2. Navigate to **My Apps & Credentials** → **Sandbox**
3. Click on your app
4. Scroll to **Webhooks** section
5. Edit your existing webhook (or add new one if needed)
6. Add these NEW event types (in addition to existing payment events):
   - ✅ `BILLING.SUBSCRIPTION.CREATED`
   - ✅ `BILLING.SUBSCRIPTION.ACTIVATED`
   - ✅ `BILLING.SUBSCRIPTION.CANCELLED`
   - ✅ `BILLING.SUBSCRIPTION.SUSPENDED`
   - ✅ `BILLING.SUBSCRIPTION.EXPIRED`
   - ✅ `PAYMENT.SALE.COMPLETED`

7. Keep existing events:
   - ✅ `PAYMENT.CAPTURE.COMPLETED`
   - ✅ `PAYMENT.CAPTURE.DENIED`
   - ✅ `PAYMENT.CAPTURE.DECLINED`
   - ✅ `PAYMENT.CAPTURE.REFUNDED`

8. Click **Save**

### 5.2 Verify Webhook URL

Ensure webhook URL is: `https://your-project-ref.supabase.co/functions/v1/paypal-webhook`

---

## Step 6: Testing

### 6.1 Test One-Time Payment

1. Go to subscription page
2. Select a tier (e.g., Student Monthly)
3. Click "PayPal" payment method
4. Choose **"One-Time Payment"**
5. Complete payment with PayPal sandbox account
6. Verify:
   - ✅ Payment succeeds
   - ✅ Transaction appears in database with `payment_type = 'one_time'`
   - ✅ User subscription is activated
   - ✅ Webhook returns 200 OK in PayPal dashboard

### 6.2 Test Recurring Subscription

1. Go to subscription page
2. Select a tier (e.g., Student Monthly)
3. Click "PayPal" payment method
4. Choose **"Auto-Renewing Subscription"**
5. Complete subscription with PayPal sandbox account
6. Verify:
   - ✅ Subscription created successfully
   - ✅ Transaction appears in database with `payment_type = 'recurring'`
   - ✅ `paypal_subscription_id` is set
   - ✅ Status changes from `pending_activation` → `completed`
   - ✅ User subscription is activated
   - ✅ Webhooks return 200 OK (check BILLING.SUBSCRIPTION.* events)

### 6.3 Test Recurring Payment

**Note:** In sandbox, you can't fast-forward time. In production, this happens automatically each billing cycle.

For sandbox testing:
1. Use PayPal's Subscription Simulator (if available)
2. Or wait for the billing cycle (not practical)
3. Or trigger webhook manually via PayPal dashboard

**In Production:**
- PayPal will automatically charge the user each month/year
- `PAYMENT.SALE.COMPLETED` webhook will be sent
- New transaction record is created
- User's limits are reset

### 6.4 Test Subscription Cancellation

**Frontend (if implemented):**
1. User goes to account settings
2. Clicks "Cancel Subscription"
3. Verify user retains access until period end
4. Verify webhook is received

**Via PayPal:**
1. Log in to sandbox.paypal.com with buyer account
2. Go to Settings → Payments → Manage automatic payments
3. Cancel the subscription
4. Verify `BILLING.SUBSCRIPTION.CANCELLED` webhook is received
5. Verify transaction status changes to `cancelled`

---

## Step 7: Check Webhook Logs

### 7.1 View Supabase Logs

```bash
npx supabase functions logs paypal-webhook --tail
```

Or in Supabase Dashboard:
- **Edge Functions** → **paypal-webhook** → **Logs**

### 7.2 Check PayPal Webhook History

1. Go to PayPal Developer Dashboard
2. Navigate to **My Apps & Credentials** → **Sandbox**
3. Click your app → **Webhooks**
4. Click **Event History**
5. Verify all events show **200 OK** status (not 401, 404, or 500)

---

## Step 8: Database Verification

### 8.1 Check Payment Transactions

```sql
-- View recent transactions
SELECT
  id,
  user_id,
  payment_type,
  paypal_subscription_id,
  status,
  amount,
  created_at
FROM payment_transactions
ORDER BY created_at DESC
LIMIT 10;
```

### 8.2 Identify Payment Types

```sql
-- Count by payment type
SELECT
  payment_type,
  COUNT(*) as count,
  SUM(amount) as total_amount
FROM payment_transactions
WHERE status = 'completed'
GROUP BY payment_type;
```

### 8.3 Find Active Subscriptions

```sql
-- Find active recurring subscriptions
SELECT
  pt.id,
  p.email,
  st.display_name as tier,
  pt.billing_cycle,
  pt.paypal_subscription_id,
  pt.created_at
FROM payment_transactions pt
JOIN profiles p ON p.id = pt.user_id
JOIN subscription_tiers st ON st.id = pt.tier_id
WHERE pt.payment_type = 'recurring'
  AND pt.status = 'completed'
  AND pt.paypal_subscription_id IS NOT NULL
ORDER BY pt.created_at DESC;
```

---

## Production Deployment

### 1. Create Production PayPal Plans

```bash
export PAYPAL_CLIENT_ID=your_live_client_id
export PAYPAL_SECRET=your_live_secret
export PAYPAL_MODE=production

node scripts/setup-paypal-plans.js
```

### 2. Update Production Database

Run the SQL output in your production Supabase project.

### 3. Deploy to Production

```bash
# Deploy webhook
npx supabase functions deploy paypal-webhook --project-ref your-prod-project

# Set secrets
npx supabase secrets set PAYPAL_CLIENT_ID=xxx --project-ref your-prod-project
npx supabase secrets set PAYPAL_SECRET=xxx --project-ref your-prod-project
npx supabase secrets set PAYPAL_MODE=production --project-ref your-prod-project
```

### 4. Update Frontend Environment

Update `.env.production`:
```bash
VITE_PAYPAL_CLIENT_ID=your_live_client_id
```

### 5. Configure Production Webhook

Follow Step 5 above, but use **Live** tab instead of **Sandbox**.

### 6. Test with Real PayPal

Test with small amounts first:
- One-time payment: $0.01
- Recurring subscription: $0.01/month

Verify everything works before launching to users.

---

## Migration Strategy

### Option A: Recommend Recurring (Soft Push)

```typescript
// Add badge to recurring option
<div className="absolute top-3 right-3 bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
  RECOMMENDED
</div>
```

### Option B: Incentivize Recurring

Offer bonus tokens for choosing recurring:
- "Get 10% more tokens with auto-renewal"
- "Save 5% with recurring subscription"

### Option C: Gradual Migration

Keep both options available indefinitely. Track metrics:
- % of new users choosing recurring
- % of one-time users willing to switch
- Retention rate: recurring vs one-time

---

## Troubleshooting

### Issue: Plans not appearing in frontend

**Solution:**
```sql
-- Check if plans exist
SELECT * FROM paypal_subscription_plans WHERE is_active = true;

-- Check RLS policies allow read
SELECT * FROM paypal_subscription_plans; -- Run as regular user
```

### Issue: Webhook returns 401 after adding subscription events

**Solution:**
Redeploy the webhook function:
```bash
npx supabase functions deploy paypal-webhook
```

### Issue: Recurring payment not creating transaction

**Solution:**
- Check `PAYMENT.SALE.COMPLETED` webhook is configured
- Verify webhook logs show the event being received
- Check `billing_agreement_id` in webhook payload matches `paypal_subscription_id`

### Issue: User subscription not activating after payment

**Solution:**
- Check if trigger function exists: `handle_new_payment_transaction`
- Verify trigger is enabled
- Check Supabase logs for errors
- Manually run:
  ```sql
  SELECT handle_new_payment_transaction();
  ```

---

## Monitoring & Analytics

### Track Payment Type Distribution

```sql
CREATE VIEW payment_type_analytics AS
SELECT
  DATE_TRUNC('day', created_at) as date,
  payment_type,
  COUNT(*) as transaction_count,
  SUM(amount) as total_revenue,
  AVG(amount) as avg_transaction
FROM payment_transactions
WHERE status = 'completed'
GROUP BY DATE_TRUNC('day', created_at), payment_type
ORDER BY date DESC;
```

### Subscription Health Dashboard

```sql
-- Active subscriptions by type
SELECT
  payment_type,
  COUNT(*) as active_subscriptions,
  SUM(amount) as monthly_recurring_revenue
FROM payment_transactions
WHERE payment_type = 'recurring'
  AND status = 'completed'
  AND paypal_subscription_id IS NOT NULL
GROUP BY payment_type;
```

---

## Support & Maintenance

### Monthly Tasks
- [ ] Check webhook success rate (should be >99%)
- [ ] Review failed payment notifications
- [ ] Monitor subscription churn rate
- [ ] Update exchange rates if needed

### When User Contacts Support

**"How do I cancel my subscription?"**
- Recurring: Settings → Subscriptions → Cancel (or via PayPal account)
- One-time: Just don't renew next period

**"I was charged but didn't get access"**
1. Check `payment_transactions` table
2. Verify webhook was received (200 OK)
3. Check trigger function ran successfully
4. Manually activate if needed

**"Can I switch from one-time to recurring?"**
- Not directly - they need to cancel one-time and start new recurring subscription
- Or implement migration function (future enhancement)

---

## Next Steps

After successful deployment:

1. **Add Subscription Management UI**
   - View active subscriptions
   - Cancel subscription button
   - Billing history

2. **Email Notifications**
   - Payment success
   - Subscription activated
   - Subscription cancelled
   - Payment failed (for recurring)
   - Upcoming renewal reminder

3. **Failed Payment Handling**
   - Retry logic
   - User notification
   - Grace period before downgrade

4. **Analytics**
   - MRR (Monthly Recurring Revenue)
   - Churn rate
   - Conversion rate: one-time → recurring

---

## Files Reference

- **Setup Script**: `scripts/setup-paypal-plans.js`
- **Migration**: `supabase/migrations/20251117000001_add_paypal_subscriptions.sql`
- **Frontend Component**: `src/components/PayPalPaymentDual.tsx`
- **Webhook Handler**: `supabase/functions/paypal-webhook/index.ts`
- **This Guide**: `PAYPAL_DUAL_SETUP_GUIDE.md`

---

## Success Checklist

- [ ] PayPal plans created in sandbox
- [ ] Database migration applied
- [ ] Plan mappings inserted
- [ ] Frontend updated to use `PayPalPaymentDual`
- [ ] Webhook function deployed
- [ ] Environment variables set
- [ ] PayPal webhook events configured
- [ ] One-time payment tested successfully
- [ ] Recurring subscription tested successfully
- [ ] Webhooks returning 200 OK
- [ ] Database transactions created correctly
- [ ] User subscriptions activated

---

**Congratulations!** 🎉

You now have a complete PayPal integration supporting both one-time and recurring payments!

For questions or issues, refer to:
- [PayPal Subscriptions API Docs](https://developer.paypal.com/docs/subscriptions/)
- [Supabase Edge Functions Docs](https://supabase.com/docs/guides/functions)
