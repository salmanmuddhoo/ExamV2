# PayPal Recurring Subscriptions Implementation Guide

## Overview

This guide explains how to implement **automatic recurring subscriptions** with PayPal, replacing the current one-time payment setup.

**Current Setup:** PayPal Buttons (one-time payments)
**Target Setup:** PayPal Subscriptions API (automatic recurring payments)

---

## ⚠️ Important Differences

| Feature | Current (Buttons) | Recurring (Subscriptions) |
|---------|------------------|---------------------------|
| Payment Type | One-time | Automatic recurring |
| User Action | Pay each period manually | Pay once, auto-renews |
| PayPal SDK | `paypal.Buttons()` | `paypal.Buttons()` with subscription intent |
| Setup Required | Client ID only | Client ID + Subscription Plans |
| Webhooks | `PAYMENT.CAPTURE.*` | `BILLING.SUBSCRIPTION.*` |
| Cancellation | User downgrades tier | User cancels subscription |
| Database | Simple transaction | Subscription ID + status tracking |

---

## Architecture Overview

### 1. PayPal Subscription Plans

You need to create **billing plans** in PayPal for each tier/cycle combination:

- Student Monthly Plan
- Student Yearly Plan
- Premium Monthly Plan
- Premium Yearly Plan

### 2. Frontend Changes

Replace `createOrder` with `createSubscription`:

```typescript
// Current (one-time payment)
window.paypal.Buttons({
  createOrder: (data, actions) => { ... }
})

// New (recurring subscription)
window.paypal.Buttons({
  createSubscription: (data, actions) => { ... }
})
```

### 3. Webhook Events

Handle different webhook events:

**Current:**
- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.CAPTURE.DENIED`

**New:**
- `BILLING.SUBSCRIPTION.CREATED`
- `BILLING.SUBSCRIPTION.ACTIVATED`
- `BILLING.SUBSCRIPTION.CANCELLED`
- `BILLING.SUBSCRIPTION.SUSPENDED`
- `BILLING.SUBSCRIPTION.EXPIRED`
- `PAYMENT.SALE.COMPLETED` (recurring payment captured)

---

## Step-by-Step Implementation

## Part 1: Create Subscription Plans in PayPal

### Option A: Via PayPal Dashboard

1. Log in to [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/)
2. Go to **Apps & Credentials** → Your App
3. Click **Subscription Plans** (if available in UI)

**Note:** PayPal may not have a UI for creating plans. Use API instead (Option B).

### Option B: Via PayPal API (Recommended)

Create a script to set up plans using PayPal REST API:

```typescript
// create-paypal-plans.ts
import fetch from 'node-fetch';

const PAYPAL_CLIENT_ID = 'your_client_id';
const PAYPAL_SECRET = 'your_secret';
const PAYPAL_API = 'https://api.sandbox.paypal.com'; // or api.paypal.com for production

// Get access token
async function getAccessToken() {
  const auth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`).toString('base64');

  const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  const data = await response.json();
  return data.access_token;
}

// Create a subscription plan
async function createPlan(accessToken, planData) {
  const response = await fetch(`${PAYPAL_API}/v1/billing/plans`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(planData)
  });

  const plan = await response.json();
  return plan;
}

// Create product (required before creating plans)
async function createProduct(accessToken) {
  const response = await fetch(`${PAYPAL_API}/v1/catalogs/products`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'Exam Study Assistant Subscription',
      description: 'Subscription plans for Exam Study Assistant',
      type: 'SERVICE',
      category: 'SOFTWARE',
      image_url: 'https://yourdomain.com/logo.png',
      home_url: 'https://yourdomain.com'
    })
  });

  const product = await response.json();
  return product.id;
}

// Main setup function
async function setupPlans() {
  const accessToken = await getAccessToken();
  const productId = await createProduct(accessToken);

  console.log('Product ID:', productId);

  // Student Monthly Plan
  const studentMonthlyPlan = await createPlan(accessToken, {
    product_id: productId,
    name: 'Student Monthly Subscription',
    description: 'Monthly subscription for Student tier',
    billing_cycles: [
      {
        frequency: {
          interval_unit: 'MONTH',
          interval_count: 1
        },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0, // 0 = infinite
        pricing_scheme: {
          fixed_price: {
            value: '10.00', // Your student monthly price in USD
            currency_code: 'USD'
          }
        }
      }
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: {
        value: '0',
        currency_code: 'USD'
      },
      setup_fee_failure_action: 'CONTINUE',
      payment_failure_threshold: 3
    }
  });

  console.log('Student Monthly Plan ID:', studentMonthlyPlan.id);

  // Student Yearly Plan
  const studentYearlyPlan = await createPlan(accessToken, {
    product_id: productId,
    name: 'Student Yearly Subscription',
    description: 'Yearly subscription for Student tier',
    billing_cycles: [
      {
        frequency: {
          interval_unit: 'YEAR',
          interval_count: 1
        },
        tenure_type: 'REGULAR',
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: {
          fixed_price: {
            value: '100.00', // Your student yearly price in USD
            currency_code: 'USD'
          }
        }
      }
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: {
        value: '0',
        currency_code: 'USD'
      },
      setup_fee_failure_action: 'CONTINUE',
      payment_failure_threshold: 3
    }
  });

  console.log('Student Yearly Plan ID:', studentYearlyPlan.id);

  // Repeat for Premium Monthly and Premium Yearly...

  console.log('✅ All plans created successfully!');
  console.log('Save these Plan IDs - you\'ll need them in your database');
}

setupPlans().catch(console.error);
```

**Run the script:**
```bash
npm install node-fetch
npx ts-node create-paypal-plans.ts
```

**Save the Plan IDs** - you'll need to store them in your database.

---

## Part 2: Update Database Schema

Add PayPal subscription tracking to your database:

```sql
-- Add PayPal subscription ID column to payment_transactions
ALTER TABLE payment_transactions
ADD COLUMN paypal_subscription_id TEXT,
ADD COLUMN paypal_plan_id TEXT;

-- Create table to store PayPal plan mappings
CREATE TABLE paypal_subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tier_id UUID REFERENCES subscription_tiers(id) NOT NULL,
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  paypal_plan_id TEXT NOT NULL UNIQUE,
  paypal_product_id TEXT,
  price DECIMAL(10, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(tier_id, billing_cycle)
);

-- Insert your PayPal plan mappings (use the Plan IDs from Part 1)
INSERT INTO paypal_subscription_plans (tier_id, billing_cycle, paypal_plan_id, price, currency)
VALUES
  -- Replace these UUIDs and Plan IDs with your actual values
  ('student-tier-uuid', 'monthly', 'P-XXXXXXXXXXXXX', 10.00, 'USD'),
  ('student-tier-uuid', 'yearly', 'P-YYYYYYYYYYYYY', 100.00, 'USD'),
  ('premium-tier-uuid', 'monthly', 'P-ZZZZZZZZZZZZZ', 20.00, 'USD'),
  ('premium-tier-uuid', 'yearly', 'P-AAAAAAAAAAAAA', 200.00, 'USD');
```

---

## Part 3: Update Frontend (PayPalPayment.tsx)

Replace the current payment implementation:

```typescript
// src/components/PayPalPayment.tsx

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

export function PayPalPayment({ paymentData, paymentMethod, onSuccess, onBack }) {
  const { user } = useAuth();
  const [sdkReady, setSdkReady] = useState(false);
  const [paypalPlanId, setPaypalPlanId] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(true);

  // Fetch PayPal Plan ID for this tier/cycle
  useEffect(() => {
    const fetchPlanId = async () => {
      const { data, error } = await supabase
        .from('paypal_subscription_plans')
        .select('paypal_plan_id')
        .eq('tier_id', paymentData.tierId)
        .eq('billing_cycle', paymentData.billingCycle)
        .eq('is_active', true)
        .single();

      if (!error && data) {
        setPaypalPlanId(data.paypal_plan_id);
      } else {
        console.error('PayPal plan not found:', error);
      }
      setLoadingPlan(false);
    };
    fetchPlanId();
  }, [paymentData.tierId, paymentData.billingCycle]);

  // Load PayPal SDK with subscription components
  useEffect(() => {
    if (!PAYPAL_CLIENT_ID) return;

    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&vault=true&intent=subscription&currency=USD`;
    script.addEventListener('load', () => setSdkReady(true));
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  useEffect(() => {
    if (sdkReady && window.paypal && paypalPlanId) {
      const container = document.querySelector('#paypal-button-container');
      if (container) container.innerHTML = '';

      window.paypal.Buttons({
        style: {
          layout: 'vertical',
          color: 'black',
          shape: 'rect',
          label: 'subscribe'
        },

        // Create subscription (not order)
        createSubscription: function(data, actions) {
          return actions.subscription.create({
            plan_id: paypalPlanId
          });
        },

        // Handle subscription approval
        onApprove: async function(data, actions) {
          try {
            console.log('Subscription created:', data.subscriptionID);

            // Create payment transaction with subscription ID
            const { data: transaction, error: transactionError } = await supabase
              .from('payment_transactions')
              .insert({
                user_id: user.id,
                tier_id: paymentData.tierId,
                payment_method_id: paymentMethod.id,
                amount: paymentData.amount,
                currency: 'USD',
                billing_cycle: paymentData.billingCycle,
                status: 'active', // Subscription status
                external_transaction_id: data.subscriptionID,
                paypal_subscription_id: data.subscriptionID,
                paypal_plan_id: paypalPlanId,
                selected_grade_id: paymentData.selectedGradeId,
                selected_subject_ids: paymentData.selectedSubjectIds,
                metadata: {
                  tier_name: paymentData.tierName,
                  subscription_data: data
                }
              })
              .select()
              .single();

            if (transactionError) throw transactionError;

            // Subscription will be activated by webhook (BILLING.SUBSCRIPTION.ACTIVATED)
            // For now, mark as pending activation

            onSuccess();
          } catch (err) {
            console.error('Error creating subscription:', err);
          }
        },

        onError: function(err) {
          console.error('PayPal subscription error:', err);
        }
      }).render('#paypal-button-container');
    }
  }, [sdkReady, paypalPlanId]);

  if (loadingPlan) {
    return <div>Loading subscription plan...</div>;
  }

  if (!paypalPlanId) {
    return <div>Error: Subscription plan not configured</div>;
  }

  return (
    <div>
      <h2>PayPal Recurring Subscription</h2>
      <p>Subscribe to {paymentData.tierName} - ${paymentData.amount} {paymentData.billingCycle}</p>
      <p>Your subscription will automatically renew each {paymentData.billingCycle.slice(0, -2)}.</p>

      <div id="paypal-button-container"></div>

      <small>You can cancel anytime from your account settings.</small>
    </div>
  );
}
```

---

## Part 4: Update Webhook Handler

Update `supabase/functions/paypal-webhook/index.ts` to handle subscription events:

```typescript
// Add to switch statement in webhook handler

switch (event.event_type) {
  // Existing payment events
  case 'PAYMENT.CAPTURE.COMPLETED':
    await handlePaymentCaptureCompleted(event, supabase);
    break;

  // New subscription events
  case 'BILLING.SUBSCRIPTION.CREATED':
    await handleSubscriptionCreated(event, supabase);
    break;

  case 'BILLING.SUBSCRIPTION.ACTIVATED':
    await handleSubscriptionActivated(event, supabase);
    break;

  case 'BILLING.SUBSCRIPTION.CANCELLED':
    await handleSubscriptionCancelled(event, supabase);
    break;

  case 'BILLING.SUBSCRIPTION.SUSPENDED':
    await handleSubscriptionSuspended(event, supabase);
    break;

  case 'BILLING.SUBSCRIPTION.EXPIRED':
    await handleSubscriptionExpired(event, supabase);
    break;

  case 'PAYMENT.SALE.COMPLETED':
    await handleRecurringPayment(event, supabase);
    break;

  default:
    console.log(`Unhandled event type: ${event.event_type}`);
}

// Handler functions
async function handleSubscriptionCreated(event: any, supabase: any) {
  const subscription = event.resource;
  console.log('Subscription created:', subscription.id);

  // Find transaction by subscription ID
  const { error } = await supabase
    .from('payment_transactions')
    .update({
      status: 'pending_activation',
      metadata: {
        subscription_created: true,
        created_at: new Date().toISOString()
      }
    })
    .eq('paypal_subscription_id', subscription.id);

  if (error) console.error('Error updating subscription:', error);
}

async function handleSubscriptionActivated(event: any, supabase: any) {
  const subscription = event.resource;
  console.log('Subscription activated:', subscription.id);

  // Activate user's subscription
  const { error } = await supabase
    .from('payment_transactions')
    .update({
      status: 'completed',
      metadata: {
        subscription_activated: true,
        activated_at: new Date().toISOString()
      }
    })
    .eq('paypal_subscription_id', subscription.id);

  if (error) console.error('Error activating subscription:', error);

  // User's subscription should now be active via trigger function
}

async function handleSubscriptionCancelled(event: any, supabase: any) {
  const subscription = event.resource;
  console.log('Subscription cancelled:', subscription.id);

  // Mark subscription as cancelled
  const { error } = await supabase
    .from('payment_transactions')
    .update({
      status: 'cancelled',
      metadata: {
        subscription_cancelled: true,
        cancelled_at: new Date().toISOString()
      }
    })
    .eq('paypal_subscription_id', subscription.id);

  if (error) console.error('Error cancelling subscription:', error);

  // Note: User keeps access until period end (handled by your existing logic)
}

async function handleSubscriptionSuspended(event: any, supabase: any) {
  const subscription = event.resource;
  console.log('Subscription suspended:', subscription.id);

  // Suspend user's subscription
  const { error } = await supabase
    .from('payment_transactions')
    .update({
      status: 'suspended',
      metadata: {
        subscription_suspended: true,
        suspended_at: new Date().toISOString(),
        reason: subscription.status_update_reason
      }
    })
    .eq('paypal_subscription_id', subscription.id);

  if (error) console.error('Error suspending subscription:', error);
}

async function handleSubscriptionExpired(event: any, supabase: any) {
  const subscription = event.resource;
  console.log('Subscription expired:', subscription.id);

  // Mark as expired and downgrade user
  const { error } = await supabase
    .from('payment_transactions')
    .update({
      status: 'expired',
      metadata: {
        subscription_expired: true,
        expired_at: new Date().toISOString()
      }
    })
    .eq('paypal_subscription_id', subscription.id);

  if (error) console.error('Error expiring subscription:', error);
}

async function handleRecurringPayment(event: any, supabase: any) {
  const sale = event.resource;
  const subscriptionId = sale.billing_agreement_id;

  console.log('Recurring payment received:', sale.id, 'for subscription:', subscriptionId);

  // Create new transaction record for the recurring payment
  const { error } = await supabase
    .from('payment_transactions')
    .insert({
      paypal_subscription_id: subscriptionId,
      external_transaction_id: sale.id,
      amount: sale.amount.total,
      currency: sale.amount.currency,
      status: 'completed',
      metadata: {
        recurring_payment: true,
        sale_data: sale,
        payment_date: new Date().toISOString()
      }
    });

  if (error) console.error('Error recording recurring payment:', error);

  // Reset user's token/paper limits for new period (call your existing reset function)
}
```

---

## Part 5: Update PayPal Webhook Configuration

Add new subscription events to your PayPal webhook:

1. Go to PayPal Developer Dashboard → Your App → Webhooks
2. Edit your existing webhook
3. Add these event types:
   - `BILLING.SUBSCRIPTION.CREATED`
   - `BILLING.SUBSCRIPTION.ACTIVATED`
   - `BILLING.SUBSCRIPTION.CANCELLED`
   - `BILLING.SUBSCRIPTION.SUSPENDED`
   - `BILLING.SUBSCRIPTION.EXPIRED`
   - `PAYMENT.SALE.COMPLETED`
4. Save

---

## Part 6: User Subscription Management

Add UI for users to manage their PayPal subscriptions:

```typescript
// Cancel PayPal subscription
async function cancelPayPalSubscription(subscriptionId: string) {
  // Call your backend endpoint that uses PayPal API
  const response = await fetch('/api/paypal/cancel-subscription', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subscriptionId })
  });

  if (response.ok) {
    // Subscription cancelled - user keeps access until end of period
    alert('Subscription cancelled. You will have access until the end of your billing period.');
  }
}
```

**Backend API endpoint** (`/api/paypal/cancel-subscription`):

```typescript
// Cancel subscription via PayPal API
async function cancelSubscription(req, res) {
  const { subscriptionId } = req.body;
  const accessToken = await getPayPalAccessToken();

  const response = await fetch(
    `https://api.paypal.com/v1/billing/subscriptions/${subscriptionId}/cancel`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reason: 'Customer requested cancellation'
      })
    }
  );

  if (response.ok) {
    res.json({ success: true });
  } else {
    const error = await response.json();
    res.status(400).json({ error });
  }
}
```

---

## Testing

### 1. Test Subscription Creation
- Select a tier and billing cycle
- Click "Subscribe with PayPal"
- Complete payment with sandbox account
- Verify subscription ID is stored in database

### 2. Test Webhooks
- Check PayPal Dashboard → Webhooks → Event History
- Verify `BILLING.SUBSCRIPTION.ACTIVATED` webhook received
- Check database - subscription should be active

### 3. Test Recurring Payment
- Wait for next billing cycle (or trigger manually in sandbox)
- Verify `PAYMENT.SALE.COMPLETED` webhook received
- Check database - new transaction created
- Verify user's tokens/limits were reset

### 4. Test Cancellation
- Cancel subscription from user settings
- Verify `BILLING.SUBSCRIPTION.CANCELLED` webhook received
- User should keep access until end of period
- Verify user downgraded at period end

---

## Migration Strategy

### Phase 1: Keep Both Systems
- Keep existing one-time payment option
- Add "Subscribe" option for recurring
- Let users choose

### Phase 2: Migrate Existing Users
- Offer existing users option to switch to subscriptions
- Provide incentive (discount, extra tokens)
- Keep one-time payment for those who prefer it

### Phase 3: Deprecate One-Time Payments (Optional)
- After all users migrated, remove one-time payment option
- Or keep both - some users prefer manual payments

---

## Production Checklist

- [ ] Create PayPal products and plans for production
- [ ] Store production Plan IDs in database
- [ ] Update environment variables to production
- [ ] Deploy webhook with subscription event handlers
- [ ] Test with real PayPal account (small amount)
- [ ] Verify recurring payments work
- [ ] Test cancellation flow
- [ ] Set up monitoring for failed payments
- [ ] Create customer support process for subscription issues

---

## Estimated Implementation Time

- Part 1 (Create plans): 1-2 hours
- Part 2 (Database): 30 minutes
- Part 3 (Frontend): 2-3 hours
- Part 4 (Webhooks): 2-3 hours
- Part 5 (Webhook config): 15 minutes
- Part 6 (Management UI): 1-2 hours
- Testing: 2-3 hours

**Total: 10-15 hours**

---

## Benefits vs Current Setup

✅ **Automatic renewals** - users don't need to manually pay each month
✅ **Better retention** - less churn from forgotten payments
✅ **Predictable revenue** - know recurring revenue in advance
✅ **Less admin work** - no manual renewal reminders needed

❌ **More complex** - requires managing subscription lifecycle
❌ **PayPal fees** - same as current (2.9% + $0.30)
❌ **Failed payments** - need to handle payment failures gracefully

---

## Support Resources

- [PayPal Subscriptions API Docs](https://developer.paypal.com/docs/subscriptions/)
- [PayPal Webhooks Reference](https://developer.paypal.com/api/webhooks/v1/)
- [PayPal Subscription Plans API](https://developer.paypal.com/docs/api/subscriptions/v1/)

---

**Questions?** Check the PayPal Developer Forums or contact PayPal merchant support.
