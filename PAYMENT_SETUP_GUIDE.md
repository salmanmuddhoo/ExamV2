# Payment Gateway Setup Guide

This guide will help you set up and configure the payment gateways (Stripe, PayPal, MCB Juice) for your exam study assistant platform.

## Table of Contents
1. [Database Migration](#database-migration)
2. [Stripe Setup](#stripe-setup)
3. [PayPal Setup](#paypal-setup)
4. [MCB Juice Setup](#mcb-juice-setup)
5. [Testing](#testing)
6. [Production Deployment](#production-deployment)

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

**Important:** If you get RLS policy errors, run the fix migration to resolve them.

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

#### 4. Test MCB Juice Payment
1. Select a paid tier
2. Choose billing cycle
3. Click payment button
4. Select **"MCB Juice"**
5. Fill in:
   - Phone number
   - Reference number (fake for testing)
   - Upload a screenshot (any image)
6. Submit for approval

#### 5. Test Admin Approval (MCB Juice)
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
- [ ] Test all payment flows in production
- [ ] Set up webhook endpoints (see below)
- [ ] Enable SSL/HTTPS
- [ ] Update currency exchange rates
- [ ] Set up email notifications for:
  - Payment success
  - Payment failure
  - MCB Juice approval/rejection

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

3. **Webhook Handlers**
   - `POST /api/webhooks/stripe`
   - `POST /api/webhooks/paypal`
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
