# Payment Receipt Email System - Setup Guide

## Overview

This system automatically sends beautiful HTML email receipts to students after successful payment transactions. Receipts include all transaction details, subscription information, package details, and applied discounts.

## Features

✅ **Automatic Receipt Sending** - Receipts sent immediately after successful payment
✅ **Beautiful HTML Design** - Responsive, professional email template
✅ **Complete Transaction Details** - Amount, date, payment method, tier, billing cycle
✅ **Package Information** - Selected grade and subjects (for Student tier)
✅ **Coupon Tracking** - Shows original amount, discount, and final amount
✅ **Multi-Payment Provider Support** - Works with Stripe, PayPal, and MCB Juice
✅ **Retry Logic** - Automatic retries with exponential backoff
✅ **Database Tracking** - Tracks which receipts have been sent
✅ **Admin Resend Capability** - Admins can manually trigger receipt sending

---

## Architecture

### Components:

1. **Database Migration** (`20251028000002_add_receipt_tracking.sql`)
   - Adds receipt tracking columns to `payment_transactions`
   - Creates `mark_receipt_sent()` function

2. **Edge Function** (`send-receipt-email/index.ts`)
   - Serverless function that sends emails via Resend API
   - Generates beautiful HTML receipt
   - Marks receipt as sent in database

3. **Frontend Helper** (`receiptUtils.ts`)
   - `sendReceiptEmail()` - Sends receipt for a transaction
   - `sendReceiptEmailWithRetry()` - Sends with retry logic
   - `hasReceiptBeenSent()` - Checks receipt status

4. **Payment Integration**
   - Integrated into StripePayment, PayPalPayment, MCBJuicePayment
   - Sends receipt after payment completion

---

## Setup Instructions

### Step 1: Run Database Migration

```bash
# Using Supabase CLI
supabase db push

# Or run directly in Supabase Dashboard SQL Editor
# Copy and run: supabase/migrations/20251028000002_add_receipt_tracking.sql
```

This creates:
- `receipt_sent` (boolean)
- `receipt_sent_at` (timestamptz)
- `receipt_email` (text)
- `receipt_id` (text)
- `mark_receipt_sent()` function

### Step 2: Sign Up for Resend

1. Go to [resend.com](https://resend.com)
2. Create a free account (100 emails/day free tier)
3. Verify your domain (or use resend.dev for testing)
4. Generate an API key

### Step 3: Configure Resend API Key

Add the Resend API key to your Supabase project:

```bash
# Using Supabase CLI
supabase secrets set RESEND_API_KEY=your_api_key_here

# Or in Supabase Dashboard:
# Settings → Edge Functions → Secrets → Add RESEND_API_KEY
```

### Step 4: Deploy the Edge Function

```bash
# Deploy the send-receipt-email function
supabase functions deploy send-receipt-email

# Verify deployment
supabase functions list
```

### Step 5: Configure Email Sender Domain

**Option A: Use Resend Test Domain (for development)**
- Emails will be sent from `onboarding@resend.dev`
- Only works with verified recipient emails
- Good for testing

**Option B: Verify Your Custom Domain (for production)**

1. Go to Resend Dashboard → Domains
2. Click "Add Domain"
3. Enter your domain (e.g., `examv2.com`)
4. Add the DNS records provided by Resend
5. Wait for verification (usually 5-10 minutes)

Then update the edge function:
```typescript
// In supabase/functions/send-receipt-email/index.ts
from: 'ExamV2 <receipts@yourdomain.com>', // Change this
```

### Step 6: Test Receipt Sending

```bash
# Test the edge function directly
supabase functions invoke send-receipt-email --body '{"transactionId":"your-transaction-id"}'

# Check logs
supabase functions logs send-receipt-email
```

---

## Receipt Email Content

The receipt includes:

### Header Section
- ✅ Payment Successful badge
- Company branding

### Transaction Details
- Transaction ID (truncated for readability)
- Payment date and time
- Subscription plan name
- Billing cycle (Monthly/Yearly)
- Payment method

### Pricing Breakdown
- Original amount (if coupon applied)
- Discount amount with coupon code badge
- Total paid amount (highlighted)

### Package Details (for Student tier)
- Selected grade level
- Selected subjects list

### Footer
- Access account button
- Company information
- Important notes

---

## Usage

### Automatic Sending (Already Integrated)

Receipts are automatically sent when:

1. **Stripe Payment** completes
2. **PayPal Payment** completes
3. **MCB Juice Payment** is approved by admin

No manual intervention required!

### Manual Resend (Admin)

Admins can resend receipts if needed:

```typescript
import { sendReceiptEmailWithRetry } from '../lib/receiptUtils';

// Resend receipt
const result = await sendReceiptEmailWithRetry(transactionId);

if (result.success) {
  console.log('Receipt sent successfully');
} else {
  console.error('Failed to send receipt:', result.error);
}
```

### Check Receipt Status

```typescript
import { hasReceiptBeenSent } from '../lib/receiptUtils';

const sent = await hasReceiptBeenSent(transactionId);
console.log('Receipt sent:', sent);
```

---

## Database Schema

### New Columns in `payment_transactions`

```sql
receipt_sent BOOLEAN DEFAULT FALSE
-- Whether receipt email has been sent

receipt_sent_at TIMESTAMPTZ
-- When the receipt was sent

receipt_email TEXT
-- Email address where receipt was sent

receipt_id TEXT
-- Resend email ID (for tracking/debugging)
```

### Helper Function

```sql
mark_receipt_sent(
  p_transaction_id UUID,
  p_email TEXT,
  p_receipt_id TEXT
) RETURNS BOOLEAN
```

Marks a transaction as having receipt sent.

---

## Troubleshooting

### Receipt Not Sending

**Check 1: Edge Function Logs**
```bash
supabase functions logs send-receipt-email --tail
```

**Check 2: Resend API Key**
```bash
# Verify secret is set
supabase secrets list
```

**Check 3: Transaction Status**
```sql
SELECT id, status, receipt_sent, receipt_sent_at
FROM payment_transactions
WHERE id = 'your-transaction-id';
```

**Check 4: Resend Dashboard**
- Go to Resend Dashboard → Emails
- Check if email was sent
- View delivery status

### Email Not Received

1. **Check Spam Folder** - Resend.dev emails often go to spam
2. **Verify Email Address** - Ensure user's email is correct
3. **Check Resend Limits** - Free tier: 100 emails/day
4. **Domain Not Verified** - Use resend.dev for testing

### Duplicate Receipts

The system prevents duplicates by:
- Checking `receipt_sent` flag
- Returning early if already sent
- Logging duplicate attempts

---

## Customization

### Email Template

Edit `supabase/functions/send-receipt-email/index.ts`:

```typescript
const generateReceiptHTML = (data: ReceiptData): string => {
  // Modify HTML here
  // Change colors, layout, text, etc.
}
```

### Email Subject

```typescript
subject: `Payment Receipt - ${receiptData.tierName} Subscription`,
// Change subject line here
```

### Sender Name/Email

```typescript
from: 'ExamV2 <noreply@examv2.com>',
// Change sender here
```

---

## Production Checklist

Before going live:

- [ ] Verify custom domain in Resend
- [ ] Update sender email from `resend.dev` to your domain
- [ ] Test receipt with real email addresses
- [ ] Monitor Edge Function logs
- [ ] Set up Resend webhook for delivery tracking (optional)
- [ ] Test with all payment methods (Stripe, PayPal, MCB Juice)
- [ ] Verify receipts include correct amounts and details
- [ ] Test coupon discount display
- [ ] Check mobile email rendering
- [ ] Set up email monitoring/alerts

---

## Monitoring & Analytics

### Database Queries

**Receipt Success Rate:**
```sql
SELECT
  COUNT(*) as total_payments,
  SUM(CASE WHEN receipt_sent THEN 1 ELSE 0 END) as receipts_sent,
  ROUND(100.0 * SUM(CASE WHEN receipt_sent THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM payment_transactions
WHERE status = 'completed';
```

**Recent Receipts:**
```sql
SELECT
  id,
  receipt_email,
  receipt_sent_at,
  amount,
  currency
FROM payment_transactions
WHERE receipt_sent = true
ORDER BY receipt_sent_at DESC
LIMIT 10;
```

**Failed Receipts:**
```sql
SELECT
  id,
  created_at,
  profiles.email,
  amount
FROM payment_transactions
LEFT JOIN profiles ON payment_transactions.user_id = profiles.id
WHERE status = 'completed' AND receipt_sent = false;
```

### Resend Dashboard

Monitor in Resend Dashboard:
- Delivery rate
- Open rate (if tracking enabled)
- Bounce rate
- Spam complaints

---

## Cost Considerations

### Resend Pricing

**Free Tier:**
- 100 emails/day
- 3,000 emails/month
- Perfect for testing and small projects

**Pro Tier ($20/month):**
- 50,000 emails/month
- $1 per 1,000 additional emails
- Custom domain required
- Email analytics

### Recommendation

Start with free tier and upgrade when you reach:
- 100+ payments/day
- Need custom domain
- Want detailed analytics

---

## Future Enhancements

Potential improvements:

1. **PDF Attachment** - Add PDF receipt as attachment
2. **Email Preferences** - Let users opt out of receipts
3. **Receipt Preview** - View receipt before sending
4. **Batch Resend** - Resend multiple receipts at once
5. **Email Templates** - Multiple template designs
6. **Localization** - Multi-language support
7. **SMS Receipts** - Send via SMS for MCB Juice payments
8. **Webhook Integration** - Resend webhooks for delivery tracking
9. **Email Open Tracking** - Track which receipts are opened
10. **Auto-Retry Failed** - Automatically retry failed sends

---

## Support

### Resend Support
- Documentation: https://resend.com/docs
- Status Page: https://status.resend.com
- Support: support@resend.com

### Testing Emails

For testing without sending real emails:
- Use https://mailtrap.io
- Use https://ethereal.email
- Use Resend's test mode

---

## Files Modified/Created

### New Files:
- `supabase/migrations/20251028000002_add_receipt_tracking.sql`
- `supabase/functions/send-receipt-email/index.ts`
- `src/lib/receiptUtils.ts`
- `RECEIPT_SYSTEM_SETUP.md`

### Modified Files:
- `src/components/StripePayment.tsx`
- `src/components/PayPalPayment.tsx`
- `src/components/AdminPaymentApproval.tsx`

---

## Summary

The receipt system is fully integrated and ready to use. After completing the setup steps above:

1. ✅ Database tracks receipt status
2. ✅ Edge function generates and sends emails
3. ✅ All payment providers trigger receipt sending
4. ✅ Receipts include all transaction details
5. ✅ System prevents duplicate sends
6. ✅ Retry logic handles failures
7. ✅ Beautiful, professional design

Students will automatically receive receipts after every successful payment! 🎉
