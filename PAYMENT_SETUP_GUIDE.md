# Payment Gateway Setup Guide

This guide will help you set up and configure the payment gateways (Stripe, PayPal, MCB Juice, Peach Payments) for your exam study assistant platform.

## Table of Contents
1. [Database Migration](#database-migration)
2. [Stripe Setup](#stripe-setup)
3. [PayPal Setup](#paypal-setup)
4. [MCB Juice Setup](#mcb-juice-setup)
5. [Peach Payments Setup](#peach-payments-setup)
6. [Testing](#testing)
7. [Production Deployment](#production-deployment)

---

## Database Migration

### Step 1: Run the Payment System Migration

If you're using Supabase locally with Docker:
```bash
cd project
npx supabase db reset
```

If you're using hosted Supabase:
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Run the migration files in order:
   - `supabase/migrations/20251011000002_create_payment_system.sql`
   - `supabase/migrations/20251011000003_fix_payment_rls_policies.sql`
   - `supabase/migrations/20251011000004_fix_storage_policies.sql`
   - `supabase/migrations/20251011000005_add_profiles_fkey_to_payments.sql`
   - `supabase/migrations/20251011000006_add_unique_user_subscription.sql`
   - `supabase/migrations/20251011000007_handle_mcb_juice_non_recurring.sql`
   - `supabase/migrations/20251011000008_add_subscription_cancellation.sql`
   - `supabase/migrations/20251011000009_token_carryover_on_upgrade.sql`

**Important:** All migrations must be run in order to avoid errors with RLS policies, storage uploads, admin dashboard queries, and payment approval.

### Step 2: Create Storage Buckets

#### For Profile Pictures (already created):
- Bucket name: `profile-pictures`
- Public: Yes

#### For Payment Proofs:
1. Go to Supabase Dashboard → **Storage**
2. Click **"New bucket"**
3. Name: `payment-proofs`
4. Public: **Yes** (checked)
5. Click **"Create bucket"**

### Step 3: Verify RLS Policies

Check that all RLS policies are applied correctly:
- `payment_methods` table
- `payment_transactions` table
- `payment_configuration` table
- Storage buckets (`profile-pictures`, `payment-proofs`)

---

## Stripe Setup

### Test Mode (Development)

#### Step 1: Create Stripe Account
1. Go to [https://stripe.com](https://stripe.com)
2. Sign up for a free account
3. Complete account verification

#### Step 2: Get Test API Keys
1. Go to Stripe Dashboard → **Developers** → **API keys**
2. Toggle to **"Test mode"** (switch at top)
3. Copy the **Publishable key** (starts with `pk_test_...`)
4. Copy the **Secret key** (starts with `sk_test_...`)

#### Step 3: Add Publishable Key to Code
Open `src/components/StripePayment.tsx` and replace:
```typescript
// Line 8:
const stripePromise = loadStripe('pk_test_YOUR_PUBLISHABLE_KEY');
```
With your actual test publishable key:
```typescript
const stripePromise = loadStripe('pk_test_51abc123...xyz789');
```

#### Step 4: Test Card Numbers
Use these test cards in Stripe test mode:
- **Success**: `4242 4242 4242 4242`
- **Requires authentication**: `4000 0025 0000 3155`
- **Declined**: `4000 0000 0000 0002`
- **Expiry**: Any future date (e.g., 12/34)
- **CVC**: Any 3 digits (e.g., 123)

### Production Mode

#### Step 1: Complete Stripe Onboarding
1. Complete business verification in Stripe Dashboard
2. Add bank account details
3. Enable payment methods you want to accept

#### Step 2: Get Live API Keys
1. Toggle to **"Live mode"**
2. Copy **Publishable key** (starts with `pk_live_...`)
3. Copy **Secret key** (starts with `sk_live_...`)

#### Step 3: Update Code for Production
Replace test keys with live keys in production environment.

---

## PayPal Setup

### Sandbox Mode (Development)

#### Step 1: Create PayPal Developer Account
1. Go to [https://developer.paypal.com](https://developer.paypal.com)
2. Log in with your PayPal account (or create one)

#### Step 2: Create Sandbox App
1. Go to **Dashboard** → **My Apps & Credentials**
2. Select **"Sandbox"** tab
3. Click **"Create App"**
4. App Name: "Exam Study Assistant" (or your choice)
5. Select **"Merchant"** as app type
6. Click **"Create App"**

#### Step 3: Get Sandbox Client ID
1. Copy the **Client ID** (starts with `AX...` or `AS...`)
2. Keep **Secret** safe (you'll need it for backend)

#### Step 4: Add Client ID to Code
Open `src/components/PayPalPayment.tsx` and replace:
```typescript
// Line 26:
const PAYPAL_CLIENT_ID = 'YOUR_PAYPAL_CLIENT_ID';
```
With your actual sandbox client ID:
```typescript
const PAYPAL_CLIENT_ID = 'AX4Abc123...xyz789';
```

#### Step 5: Create Sandbox Test Accounts
1. Go to **Sandbox** → **Accounts**
2. You should see auto-created accounts:
   - **Personal** (buyer): Use this to test payments
   - **Business** (merchant): Your business account
3. Click **"..."** → **"View/Edit Account"** to see credentials
4. Use these to login to sandbox.paypal.com for testing

### Production Mode

#### Step 1: Create Live App
1. Go to **My Apps & Credentials**
2. Select **"Live"** tab
3. Click **"Create App"**
4. Complete business verification

#### Step 2: Get Live Client ID
1. Copy **Live Client ID**
2. Update code for production

---

## MCB Juice Setup

### Configuration

MCB Juice payments require manual approval. No API integration is needed.

**IMPORTANT: MCB Juice is a manual payment method - subscriptions will NOT auto-renew.**
- Users must manually submit a new payment each month/year
- When subscription expires, users will be downgraded to Free tier
- Admin should notify users before expiration to remind them to renew

#### Step 1: Get MCB Juice Merchant Account
1. Contact MCB Bank Mauritius
2. Apply for MCB Juice merchant account
3. Get your merchant phone number

#### Step 2: Exchange Rate Configuration
Update the exchange rate in `src/components/PaymentMethodSelector.tsx`:
```typescript
// Line 67:
const exchangeRate = 45.5; // Update this regularly
```

And in `src/components/MCBJuicePayment.tsx`:
```typescript
// Line 23:
const exchangeRate = 45.5; // Update this regularly
```

Consider using a currency API for real-time rates in production.

#### Step 3: Update Payment Instructions
Update the MCB Juice merchant details in `src/components/MCBJuicePayment.tsx`:
- Line 59-67: Add your actual merchant account number/details

---

## Peach Payments Setup

### Test Mode (Development)

Peach Payments is currently in test mode with simulated transactions. No real charges will be processed.

#### Step 1: Add Peach Payments to Database

Run this SQL command in your Supabase SQL Editor to add Peach Payments to the payment methods:

```sql
INSERT INTO payment_methods (name, display_name, is_active, currency, requires_manual_approval)
VALUES ('peach', 'Peach Payments', false, 'USD', false);
```

#### Step 2: Enable Peach Payments (Admin)

1. Login as admin
2. Go to **Admin Dashboard** → **Payment Method Settings**
3. Find **Peach Payments** in the list
4. Click **"Activate"** to enable it for users

#### Step 3: Test Card Numbers

Use these test cards in Peach Payments test mode:
- **Success**: `5123 4567 8901 2346`
- **Expiry**: Any future date (e.g., 12/34)
- **CVV**: Any 3 digits (e.g., 123)
- **Card Holder**: Any name (e.g., JOHN DOE)

### Production Mode

#### Step 1: Sign Up for Peach Payments

1. Go to [Peach Payments](https://www.peachpayments.com/) or contact their sales team
2. Complete the merchant onboarding process
3. Provide business verification documents
4. Set up your bank account for settlements

#### Step 2: Get Production API Credentials

After account approval:
1. Login to Peach Payments Dashboard
2. Navigate to **Settings** → **API Keys**
3. Copy your **Entity ID** (merchant identifier)
4. Copy your **Authentication Token** or **Access Token**
5. Note your **Payment Gateway URL** (production endpoint)

**Documentation**: https://developer.peachpayments.com/docs/

#### Step 3: Create Backend API Endpoint

You need to create a secure backend endpoint to process Peach Payments. The frontend cannot directly call Peach Payments API for security reasons.

**Create**: `/api/peach/create-checkout`

Example implementation (Node.js/Express):

```javascript
const express = require('express');
const router = express.Router();

// Your Peach Payments credentials (use environment variables!)
const PEACH_ENTITY_ID = process.env.PEACH_ENTITY_ID;
const PEACH_ACCESS_TOKEN = process.env.PEACH_ACCESS_TOKEN;
const PEACH_API_URL = 'https://api.peachpayments.com/v1'; // Production URL

router.post('/create-checkout', async (req, res) => {
  try {
    const { amount, currency, card } = req.body;

    // Validate inputs
    if (!amount || !currency || !card) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Create checkout with Peach Payments API
    const response = await fetch(`${PEACH_API_URL}/checkouts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PEACH_ACCESS_TOKEN}`
      },
      body: JSON.stringify({
        entityId: PEACH_ENTITY_ID,
        amount: amount.toFixed(2),
        currency: currency,
        paymentType: 'DB', // Debit (immediate capture)
        card: {
          number: card.number,
          holder: card.holder,
          expiryMonth: card.expiry_month,
          expiryYear: card.expiry_year,
          cvv: card.cvv
        },
        merchantTransactionId: req.body.transaction_id // Your internal transaction ID
      })
    });

    const data = await response.json();

    if (data.result.code === '000.100.110') {
      // Success
      return res.json({
        success: true,
        checkout_id: data.id,
        transaction_id: data.merchantTransactionId
      });
    } else {
      // Failed
      return res.status(400).json({
        error: 'Payment failed',
        code: data.result.code,
        description: data.result.description
      });
    }
  } catch (error) {
    console.error('Peach Payments error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
```

#### Step 4: Update Frontend Code

Open `src/components/PeachPayment.tsx` and uncomment/update the API integration section (around line 120):

```typescript
// Replace the simulated payment with actual API call
const response = await fetch('/api/peach/create-checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    amount: finalAmount,
    currency: 'USD',
    card: {
      number: cleanCardNumber,
      holder: cardHolder,
      expiry_month: expiryDate.split('/')[0],
      expiry_year: '20' + expiryDate.split('/')[1],
      cvv: cvv
    },
    transaction_id: transaction.id
  })
});

const result = await response.json();

if (!result.success) {
  throw new Error(result.error || 'Payment failed');
}

// Update transaction with Peach Payments checkout ID
const { error: updateError } = await supabase
  .from('payment_transactions')
  .update({
    status: 'completed',
    external_transaction_id: result.checkout_id,
    metadata: {
      tier_name: paymentData.tierName,
      peach_checkout_id: result.checkout_id,
      // ... rest of metadata
    }
  })
  .eq('id', transaction.id);
```

#### Step 5: Set Up Webhooks (Recommended)

Configure webhooks to receive real-time payment status updates:

1. Go to Peach Payments Dashboard → **Settings** → **Webhooks**
2. Add webhook URL: `https://yourdomain.com/api/webhooks/peach`
3. Select events:
   - `payment.success`
   - `payment.failed`
   - `payment.pending`
4. Copy the **Webhook Secret** for signature verification

**Create**: `/api/webhooks/peach`

```javascript
router.post('/webhooks/peach', async (req, res) => {
  // Verify webhook signature
  const signature = req.headers['x-peach-signature'];
  const webhookSecret = process.env.PEACH_WEBHOOK_SECRET;

  // Verify signature (implementation depends on Peach's signature method)
  // ...

  const event = req.body;

  if (event.type === 'payment.success') {
    // Update transaction status to completed
    await supabase
      .from('payment_transactions')
      .update({ status: 'completed' })
      .eq('external_transaction_id', event.checkout_id);
  } else if (event.type === 'payment.failed') {
    // Mark as failed
    await supabase
      .from('payment_transactions')
      .update({ status: 'failed' })
      .eq('external_transaction_id', event.checkout_id);
  }

  res.json({ received: true });
});
```

#### Step 6: Security Considerations

1. **Never expose API credentials** in frontend code
2. **Always use HTTPS** in production
3. **Validate webhook signatures** to prevent fraud
4. **Store sensitive data securely** (use environment variables)
5. **Implement rate limiting** on payment endpoints
6. **Log all transactions** for audit trails
7. **Use PCI-compliant infrastructure** if handling card data directly

#### Step 7: Testing Production

Before going live:
1. Test with small amounts first
2. Verify webhooks are being received
3. Test all payment scenarios (success, failure, pending)
4. Verify subscription activation works correctly
5. Check receipt emails are sent
6. Test refund process if applicable

### Currency Support

- **Default Currency**: USD (United States Dollar)
- **Multi-Currency**: Check with Peach Payments for supported currencies
- **Settlement Currency**: Confirm with Peach Payments which currency you'll receive settlements in

### Support Resources

- **Documentation**: https://developer.peachpayments.com/docs/
- **Sandbox Dashboard**: https://dashboard.sandbox.peachpayments.com/
- **Production Dashboard**: https://dashboard.peachpayments.com/
- **Support**: Contact Peach Payments support team

---

## Testing

### Test the Full Payment Flow

#### 1. Sign Up/Login
- Create a test user account
- Navigate to Subscription Management

#### 2. Test Stripe Payment
1. Select a paid tier (Student or Premium)
2. Choose billing cycle
3. Click payment button
4. Select **"Credit/Debit Card (Stripe)"**
5. Enter test card: `4242 4242 4242 4242`
6. Complete payment
7. Verify subscription is activated

#### 3. Test PayPal Payment
1. Select a paid tier
2. Choose billing cycle
3. Click payment button
4. Select **"PayPal"**
5. Login with sandbox buyer account
6. Complete payment
7. Verify subscription is activated

#### 4. Test Peach Payments
1. Select a paid tier
2. Choose billing cycle
3. Click payment button
4. Select **"Peach Payments"**
5. Enter test card details:
   - Card Number: `5123 4567 8901 2346`
   - Card Holder: `JOHN DOE`
   - Expiry: Any future date (e.g., `12/25`)
   - CVV: `123`
6. Complete payment
7. Verify subscription is activated

#### 5. Test MCB Juice Payment
1. Select a paid tier
2. Choose billing cycle
3. Click payment button
4. Select **"MCB Juice"**
5. Fill in:
   - Phone number
   - Reference number (fake for testing)
   - Upload a screenshot (any image)
6. Submit for approval

#### 6. Test Admin Approval (MCB Juice)
1. Login as admin
2. Go to Admin Dashboard → **Payment Approvals**
3. Find the pending MCB Juice payment
4. Click **"View Proof"** to see uploaded screenshot
5. Click **"Approve"** to activate subscription
6. Or click **"Reject"** with reason

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] Replace all test API keys with production keys
- [ ] Enable production mode in Stripe
- [ ] Use live PayPal app credentials
- [ ] Verify MCB Juice merchant account is active
- [ ] Set up Peach Payments backend API endpoint
- [ ] Test Peach Payments with real transactions (small amounts)
- [ ] Test all payment flows in production
- [ ] Set up webhook endpoints (see below)
- [ ] Enable SSL/HTTPS
- [ ] Update currency exchange rates
- [ ] Set up email notifications for:
  - Payment success
  - Payment failure
  - MCB Juice approval/rejection
  - Peach Payments status updates

### Environment Variables (Recommended)

Instead of hardcoding API keys, use environment variables:

Create `.env.local`:
```bash
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
VITE_PAYPAL_CLIENT_ID=...
VITE_MCB_EXCHANGE_RATE=45.5
```

Update code to use:
```typescript
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY);
const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID;
```

### Webhooks Setup (Important!)

#### Stripe Webhooks
1. Go to Stripe Dashboard → **Developers** → **Webhooks**
2. Click **"Add endpoint"**
3. URL: `https://yourdomain.com/api/webhooks/stripe`
4. Events to listen:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
5. Copy **Signing secret** (starts with `whsec_...`)

#### PayPal Webhooks
1. Go to PayPal Developer Dashboard → **My Apps & Credentials**
2. Select your Live app
3. Scroll to **"Webhooks"**
4. Click **"Add Webhook"**
5. URL: `https://yourdomain.com/api/webhooks/paypal`
6. Events to listen:
   - `PAYMENT.CAPTURE.COMPLETED`
   - `PAYMENT.CAPTURE.DENIED`

#### Peach Payments Webhooks
1. Go to Peach Payments Dashboard → **Settings** → **Webhooks**
2. Click **"Add Webhook"**
3. URL: `https://yourdomain.com/api/webhooks/peach`
4. Events to listen:
   - `payment.success`
   - `payment.failed`
   - `payment.pending`
5. Copy **Webhook Secret** for signature verification

### Backend API Endpoints Needed

You'll need to create backend endpoints for:

1. **Stripe Payment Intent**
   - `POST /api/stripe/create-payment-intent`
   - Creates payment intent with amount
   - Returns client_secret

2. **PayPal Order Creation**
   - `POST /api/paypal/create-order`
   - Creates PayPal order
   - Returns order ID

3. **Peach Payments Checkout**
   - `POST /api/peach/create-checkout`
   - Creates checkout with card details
   - Returns checkout ID and status

4. **Webhook Handlers**
   - `POST /api/webhooks/stripe`
   - `POST /api/webhooks/paypal`
   - `POST /api/webhooks/peach`
   - Verify webhook signatures
   - Update database accordingly

---

## Currency Information

### Stripe & PayPal (USD)
- **Currency**: United States Dollar (USD)
- **Symbol**: $
- **Example**: $10.00

### MCB Juice (MUR)
- **Currency**: Mauritian Rupee (MUR)
- **Symbol**: Rs
- **Example**: Rs 455
- **Exchange Rate**: ~45.5 MUR per 1 USD (update regularly!)

---

## Subscription Management

### Automatic Renewal vs Manual Renewal

The system handles two types of subscriptions:

#### 1. Auto-Renewing (Stripe, PayPal)
- Subscription automatically renews at the end of each period
- `is_recurring = TRUE` in database
- Token/paper limits reset automatically each period
- Users are charged automatically by payment provider

#### 2. Manual Renewal (MCB Juice)
- Subscription does **NOT** automatically renew
- `is_recurring = FALSE` in database
- User must submit a new payment each period
- Subscription expires at `period_end_date` if not renewed
- User is automatically downgraded to Free tier upon expiration

### Checking Expiring Subscriptions

To find users whose subscriptions are expiring soon (for notification purposes):

```sql
-- Find subscriptions expiring in next 7 days (MCB Juice users)
SELECT * FROM check_expiring_subscriptions(7);
```

This returns:
- User email
- Tier name
- Expiration date
- Days remaining
- Payment method used

**Recommended:** Set up a daily cron job to check this and send reminder emails.

### Expiring Non-Recurring Subscriptions

To manually expire subscriptions that have passed their end date:

```sql
-- Expire non-recurring subscriptions and downgrade to free tier
SELECT expire_non_recurring_subscriptions();
```

**Recommended:** Set up a daily cron job to run this function automatically.

### Resetting Recurring Subscriptions

To reset token/paper limits for recurring subscriptions at the start of new period:

```sql
-- Reset limits for auto-renewing subscriptions
SELECT reset_subscription_period();
```

**Note:** This only affects `is_recurring = TRUE` subscriptions (Stripe, PayPal). MCB Juice subscriptions will not be reset.

### User Subscription Cancellation

Users can cancel their subscriptions at any time, but they retain full access until the end of their billing period.

**How it works:**
1. User clicks "Cancel Subscription" in their profile
2. Subscription is marked with `cancel_at_period_end = TRUE`
3. User keeps full access until `period_end_date`
4. At `period_end_date`, subscription status changes to 'cancelled'
5. User is automatically downgraded to Free tier

**User can reactivate:**
- User can click "Reactivate Subscription" before the period ends
- This removes the cancellation flag and restores auto-renewal (if applicable)

**SQL Functions:**
```sql
-- Cancel a subscription (user retains access until period_end_date)
SELECT * FROM cancel_subscription_at_period_end(user_id, 'Optional reason');

-- Reactivate a cancelled subscription
SELECT * FROM reactivate_subscription(user_id);

-- Process all cancellations and expirations (run daily via cron)
SELECT process_subscription_expirations();
```

**Recommended Cron Job:**
Set up a daily cron job to process expirations:
```sql
-- Run once per day
SELECT process_subscription_expirations();
```

This function handles both:
- Non-recurring subscriptions (MCB Juice) that have expired
- Cancelled subscriptions that have reached their end date

---

## Support & Troubleshooting

### Common Issues

**Stripe payment fails:**
- Check API keys are correct
- Verify Stripe account is activated
- Check browser console for errors
- Ensure card is not in declined test cards list

**PayPal button not showing:**
- Check Client ID is correct
- Verify PayPal SDK loaded (check browser console)
- Check for JavaScript errors
- Try clearing browser cache

**MCB Juice image upload fails:**
- Verify `payment-proofs` storage bucket exists
- Check RLS policies are correct
- Ensure file size is under 5MB
- Check image format is supported (PNG, JPG)

**Subscription not activating:**
- Check payment transaction status in database
- Verify trigger function is working
- Check for errors in Supabase logs
- Ensure RLS policies allow updates

### Getting Help

- **Stripe**: https://support.stripe.com
- **PayPal**: https://developer.paypal.com/support
- **Supabase**: https://supabase.com/docs

---

## Security Best Practices

1. **Never** commit API keys to version control
2. Use environment variables for all secrets
3. Enable RLS on all tables
4. Validate all inputs on backend
5. Use HTTPS in production
6. Implement rate limiting on payment endpoints
7. Log all payment transactions
8. Set up monitoring and alerts
9. Regular security audits
10. Keep dependencies updated

---

## Next Steps

After completing setup:
1. Test all payment flows thoroughly
2. Set up email notifications
3. Configure tax calculations (if needed)
4. Set up refund processes
5. Create admin training documentation
6. Plan for handling payment disputes
7. Set up analytics tracking
8. Configure backup payment methods

---

**Last Updated**: October 2025
**Version**: 1.0.0
