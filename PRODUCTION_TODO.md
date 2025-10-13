# Production Deployment Checklist

## 🚨 Critical Tasks Before Going Live

### 1. Stripe Recurring Billing Setup (5-7 days estimated)

#### Database Migrations
- [ ] Add `stripe_customer_id` column to `profiles` table
- [ ] Add `stripe_subscription_id` column to `user_subscriptions` table
- [ ] Apply migration: `supabase/migrations/20251012000009_fix_payment_transaction_update_rls.sql`
- [ ] Apply migration: `supabase/migrations/20251012000010_fix_yearly_subscription_monthly_reset.sql`
- [ ] Apply migration: `supabase/migrations/20251012000011_ensure_recurring_subscriptions_by_default.sql`
- [ ] Apply migration: `supabase/migrations/20251012000012_setup_subscription_cron_jobs.sql`
- [ ] Apply migration: `supabase/migrations/20251012000013_add_payment_verification_to_token_reset.sql`

#### Backend Infrastructure
- [ ] Create Supabase Edge Function: `stripe-webhook`
  - Handle `invoice.payment_succeeded` → Call `handle_successful_payment()`
  - Handle `invoice.payment_failed` → Call `suspend_subscription_for_failed_payment()`
  - Handle `customer.subscription.deleted` → Cancel subscription
  - Handle `customer.subscription.updated` → Update subscription details
  - Handle `payment_method.attached` → Store payment method

- [ ] Create Supabase Edge Function: `create-stripe-subscription`
  - Create Stripe Customer (if doesn't exist)
  - Create Stripe Subscription (not just payment method)
  - Store `stripe_customer_id` and `stripe_subscription_id`
  - Return subscription details to frontend

- [ ] Create Supabase Edge Function: `manage-stripe-subscription`
  - Handle subscription upgrades/downgrades
  - Handle subscription cancellations
  - Update Stripe subscription when user changes plan

#### Frontend Updates
- [ ] Update `StripePayment.tsx`:
  - Call backend to create Stripe Subscription (not one-time payment)
  - Remove test mode simulation code
  - Handle subscription creation response
  - Store subscription ID in database

#### Stripe Configuration
- [ ] Set up Stripe Webhook endpoint in Stripe Dashboard
  - Point to your Edge Function URL
  - Subscribe to required events (invoice.*, customer.subscription.*)
  - Add webhook signing secret to environment variables

- [ ] Move from test mode to live mode:
  - Replace test API keys with live API keys
  - Update Stripe publishable key in `StripePayment.tsx` (line 10)

#### Payment Verification
- [ ] Uncomment payment verification in `reset_subscription_period()` function
  - Location: `supabase/migrations/20251012000013_add_payment_verification_to_token_reset.sql`
  - Lines with: `-- In production, add payment verification:`
  - This ensures tokens only reset after payment confirmation

### 2. Supabase Migrations to Apply

Run these in Supabase Dashboard → SQL Editor (in order):

1. `20251012000008_fix_access_check_token_override.sql` - Fixes 403 errors for token carryover
2. `20251012000009_fix_payment_transaction_update_rls.sql` - Allows users to update their payments
3. `20251012000010_fix_yearly_subscription_monthly_reset.sql` - Yearly subscription monthly resets
4. `20251012000011_ensure_recurring_subscriptions_by_default.sql` - Recurring payment logic
5. `20251012000012_setup_subscription_cron_jobs.sql` - Automated token resets
6. `20251012000013_add_payment_verification_to_token_reset.sql` - Payment tracking

### 3. Cron Jobs Verification

- [ ] Verify pg_cron extension is enabled in Supabase
- [ ] Verify cron jobs are scheduled:
  ```sql
  SELECT * FROM cron.job;
  ```
- [ ] Test cron jobs manually:
  ```sql
  SELECT * FROM run_subscription_maintenance();
  ```

### 4. Testing Checklist

#### Stripe Subscription Flow
- [ ] Test new user signup → Creates Stripe Customer
- [ ] Test subscription purchase → Creates Stripe Subscription
- [ ] Test successful payment → Activates subscription, resets tokens
- [ ] Test failed payment → Suspends subscription, sends notification
- [ ] Test subscription upgrade → Updates Stripe subscription
- [ ] Test subscription cancellation → Cancels at period end
- [ ] Test subscription reactivation → Removes cancellation

#### Token Management
- [ ] Test monthly token reset (after webhook payment_succeeded)
- [ ] Test yearly subscription gets monthly tokens
- [ ] Test unused tokens don't carry over month-to-month
- [ ] Test token carryover works when upgrading tiers
- [ ] Test token display caps at limit for non-admin users

#### Webhook Testing
- [ ] Use Stripe CLI to test webhooks locally
- [ ] Test all webhook events in staging environment
- [ ] Verify webhook signature validation
- [ ] Test webhook retry logic for failures

### 5. Security & Performance

- [ ] Review all RLS policies for security
- [ ] Add rate limiting to webhook endpoints
- [ ] Set up error monitoring (Sentry, LogRocket, etc.)
- [ ] Add logging for all payment transactions
- [ ] Set up alerts for failed payments
- [ ] Review database indexes for performance
- [ ] Load test subscription renewal process

### 6. Environment Variables

Add to production environment:
```
STRIPE_LIVE_SECRET_KEY=sk_live_...
STRIPE_LIVE_PUBLISHABLE_KEY=pk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 7. Documentation

- [ ] Document Stripe webhook setup process
- [ ] Document subscription upgrade/downgrade flows
- [ ] Document failed payment recovery process
- [ ] Document manual subscription management procedures
- [ ] Create runbook for common subscription issues

---

## 📝 Notes

### Current Test Mode Limitations
- Only one-time payments (no recurring billing)
- No Stripe Customer objects created
- No Stripe Subscription objects created
- Tokens reset automatically by date (no payment verification)
- Manual approval required for MCB Juice payments

### Production Requirements
- Stripe Subscriptions API integration
- Webhook handlers for payment events
- Payment verification before token resets
- Automatic subscription renewals
- Failed payment handling and retries

---

## 🔗 Related Files

- Payment Handler: `src/components/StripePayment.tsx`
- Subscription Manager: `src/components/SubscriptionManager.tsx`
- Database Functions: `supabase/migrations/2025101*.sql`
- Token Reset Logic: `reset_subscription_period()` function

---

## ⏱️ Estimated Timeline

- Database setup: 1 day
- Backend Edge Functions: 2-3 days
- Frontend updates: 1 day
- Testing & debugging: 2 days
- **Total: 5-7 days**

---

**Last Updated:** 2025-10-12
**Status:** Test Mode - Not Production Ready
