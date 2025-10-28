# Receipt Email System - Production Deployment Guide

## Overview

This guide walks you through the steps needed to deploy the receipt email system to production. Currently, the system uses Resend's test domain (`onboarding@resend.dev`) which only sends to your registered email. For production, you need to verify your own domain.

---

## 🚀 Production Deployment Checklist

### ✅ Prerequisites

Before going to production, ensure you have:
- [ ] Completed payment system testing
- [ ] Resend account created
- [ ] A domain name (or willing to purchase one)
- [ ] Access to your domain's DNS settings

---

## Step 1: Domain Verification in Resend

### 1.1 Choose Your Domain

**Option A: Use an Existing Domain**
- If you already own a domain (e.g., `examv2.com`, `myschool.com`)
- Use that domain or a subdomain

**Option B: Purchase a New Domain**

Recommended registrars:
- **Namecheap** - https://namecheap.com (~$10/year for `.com`)
- **Porkbun** - https://porkbun.com (~$9/year)
- **Google Domains** - https://domains.google (~$12/year)
- **Cloudflare** - https://cloudflare.com (~$10/year)

**Popular domain extensions:**
- `.com` - Most professional
- `.io` - Tech/startup focused
- `.app` - Application focused
- `.edu` - Educational (requires verification)

### 1.2 Add Domain to Resend

1. **Login to Resend Dashboard**
   - Go to https://resend.com/login
   - Sign in with your account

2. **Navigate to Domains**
   - Click on "Domains" in the sidebar
   - Or go directly to https://resend.com/domains

3. **Add Your Domain**
   - Click "Add Domain" button
   - Enter your domain name (e.g., `examv2.com`)
   - **Important:** Use the root domain, not `www.examv2.com`
   - Click "Add"

4. **Get DNS Records**

   Resend will provide you with DNS records similar to:

   ```
   Record 1: Domain Verification
   Type: TXT
   Name: @ (or your domain)
   Value: resend_verify=abc123xyz...
   TTL: 3600 (or Auto)

   Record 2: MX (Mail Exchange)
   Type: MX
   Name: @ (or your domain)
   Value: mx.resend.com
   Priority: 10
   TTL: 3600 (or Auto)

   Record 3: SPF (Sender Policy Framework)
   Type: TXT
   Name: @ (or your domain)
   Value: v=spf1 include:_spf.resend.com ~all
   TTL: 3600 (or Auto)

   Record 4: DKIM (Optional but recommended)
   Type: TXT
   Name: resend._domainkey
   Value: p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC...
   TTL: 3600 (or Auto)
   ```

### 1.3 Add DNS Records to Your Domain

**For Namecheap:**
1. Login to Namecheap
2. Go to "Domain List"
3. Click "Manage" next to your domain
4. Go to "Advanced DNS" tab
5. Add each record:
   - Click "Add New Record"
   - Select the Type (TXT, MX)
   - Enter Host (@ or subdomain)
   - Enter Value
   - Set TTL (Automatic or 3600)
   - Click "Save Changes"

**For Cloudflare:**
1. Login to Cloudflare
2. Select your domain
3. Go to "DNS" tab
4. Click "Add record"
5. Select Type, enter Name and Content
6. Click "Save"

**For GoDaddy:**
1. Login to GoDaddy
2. My Products → Domain
3. DNS Management
4. Add each record

**For Google Domains:**
1. Login to Google Domains
2. Select your domain
3. DNS → Custom records
4. Create new record for each

### 1.4 Wait for Verification

- **Propagation time:** 5 minutes to 48 hours (usually 10-30 minutes)
- **Check status:** Resend will auto-verify when DNS propagates
- **Verify manually:** You can click "Verify" button in Resend dashboard

**Check DNS propagation:**
- Use https://dnschecker.org
- Enter your domain
- Select "TXT" record type
- Look for the Resend verification code

---

## Step 2: Update Edge Function Configuration

### 2.1 Modify the Sender Email

**File to edit:** `supabase/functions/send-receipt-email/index.ts`

**Find this section (around line 405):**

```typescript
body: JSON.stringify({
  from: 'ExamV2 <onboarding@resend.dev>',  // <- CHANGE THIS LINE
  to: [receiptData.userEmail],
  subject: `Payment Receipt - ${receiptData.tierName} Subscription`,
  html: htmlContent
})
```

**Update to use your verified domain:**

```typescript
body: JSON.stringify({
  from: 'ExamV2 <receipts@yourdomain.com>',  // <- YOUR DOMAIN HERE
  to: [receiptData.userEmail],
  subject: `Payment Receipt - ${receiptData.tierName} Subscription`,
  html: htmlContent
})
```

**Recommended sender addresses:**
- `receipts@yourdomain.com` ✅ Best for payment receipts
- `noreply@yourdomain.com` ✅ Common choice
- `billing@yourdomain.com` ✅ Professional
- `hello@yourdomain.com` ✅ Friendly
- `support@yourdomain.com` ⚠️ Users might reply to this

**Important:** Replace `yourdomain.com` with your actual verified domain!

### 2.2 Commit Changes

```bash
git add supabase/functions/send-receipt-email/index.ts
git commit -m "Update receipt sender email to verified domain"
git push
```

### 2.3 Redeploy Edge Function

```bash
# Deploy the updated function
supabase functions deploy send-receipt-email

# Verify deployment
supabase functions list

# Check logs
supabase functions logs send-receipt-email
```

---

## Step 3: Customize Email Template (Optional)

### 3.1 Where to Edit

The email template is in the same file: `supabase/functions/send-receipt-email/index.ts`

**Function to modify:** `generateReceiptHTML()` (starts around line 32)

### 3.2 Customization Options

**Change Colors:**

```typescript
// Find the style section (around line 50-100)
.header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); // <- CHANGE COLORS
  color: white;
  padding: 40px 30px;
  text-align: center;
}
```

**Example color schemes:**
- Blue gradient: `linear-gradient(135deg, #667eea 0%, #764ba2 100%)`
- Green gradient: `linear-gradient(135deg, #11998e 0%, #38ef7d 100%)`
- Orange gradient: `linear-gradient(135deg, #f46b45 0%, #eea849 100%)`
- Purple gradient: `linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)`

**Add Your Logo:**

```typescript
// In the header section (around line 175)
<div class="header">
  <!-- ADD YOUR LOGO -->
  <img src="https://yourdomain.com/logo.png" alt="ExamV2 Logo" style="width: 150px; margin-bottom: 20px;">

  <h1>✅ Payment Successful!</h1>
  <p>Thank you for your purchase</p>
</div>
```

**Change Company Name:**

```typescript
// Find all instances of "ExamV2" and replace with your company name
// Use Find & Replace (Ctrl+F or Cmd+F)
// Search: ExamV2
// Replace: Your Company Name
```

**Update Footer:**

```typescript
// Around line 280
<div class="footer">
  <p style="font-weight: 600; color: #1f2937;">Your Company Name</p>
  <p>This is an automated receipt for your records.</p>
  <p>Please keep this email for your reference.</p>

  <!-- ADD ADDITIONAL INFO -->
  <p style="margin-top: 20px; font-size: 12px;">
    Questions? Contact us at support@yourdomain.com
  </p>
  <p style="font-size: 12px;">
    Your Company Address | Phone: +123-456-7890
  </p>
</div>
```

**Change Button URL:**

```typescript
// Find the "Access Your Account" button (around line 255)
<a href="${SUPABASE_URL?.replace('/rest/v1', '')}" class="button">
  Access Your Account
</a>

// Replace with your app URL:
<a href="https://exam-v2.vercel.app" class="button">
  Access Your Account
</a>

// Or use a dynamic URL:
<a href="https://yourdomain.com/dashboard" class="button">
  Go to Dashboard
</a>
```

**Add Social Media Links:**

```typescript
// In footer section
<div style="margin-top: 20px;">
  <a href="https://twitter.com/yourcompany" style="margin: 0 10px;">
    <img src="https://yourcdn.com/twitter-icon.png" alt="Twitter" style="width: 24px;">
  </a>
  <a href="https://facebook.com/yourcompany" style="margin: 0 10px;">
    <img src="https://yourcdn.com/facebook-icon.png" alt="Facebook" style="width: 24px;">
  </a>
</div>
```

**Change Email Subject:**

```typescript
// Around line 407
subject: `Payment Receipt - ${receiptData.tierName} Subscription`,

// Change to:
subject: `Thank you for your purchase! - Receipt #${receiptData.transactionId.substring(0, 8)}`,
// Or:
subject: `Your ${receiptData.tierName} Receipt from ExamV2`,
```

### 3.3 Testing Template Changes

After making changes:

1. **Save the file**
2. **Redeploy the function:**
   ```bash
   supabase functions deploy send-receipt-email
   ```
3. **Test with a payment**
4. **Check your email**
5. **Iterate until perfect**

**Pro tip:** Use an HTML email preview tool:
- https://www.htmlemailcheck.com/check/
- https://litmus.com/email-previews (paid)
- Test in Gmail, Outlook, Apple Mail

### 3.4 Template Best Practices

✅ **Do:**
- Keep it simple and clean
- Use web-safe fonts (Arial, Helvetica, sans-serif)
- Test on mobile devices
- Include all transaction details
- Make important info stand out
- Use high contrast colors

❌ **Don't:**
- Use JavaScript (not supported in emails)
- Use external CSS files
- Use complex layouts (tables work best)
- Forget to test on mobile
- Use too many images (slow loading)

---

## Step 4: Production Testing

### 4.1 Test Checklist

Before going live, test thoroughly:

- [ ] **Domain Verified:** Check Resend dashboard shows "Verified"
- [ ] **Sender Email Updated:** Changed from `resend.dev` to your domain
- [ ] **Edge Function Deployed:** Run `supabase functions list`
- [ ] **Test Payment - Stripe:** Make a test payment, verify receipt
- [ ] **Test Payment - PayPal:** Make a test payment, verify receipt
- [ ] **Test Payment - MCB Juice:** Admin approves, verify receipt
- [ ] **Test With Coupon:** Apply coupon, check discount shows correctly
- [ ] **Test Different Tiers:** Free → Student → Pro receipts
- [ ] **Test Billing Cycles:** Monthly and Yearly receipts
- [ ] **Check Spam Folder:** Ensure receipts don't go to spam
- [ ] **Mobile Preview:** Check email on mobile devices
- [ ] **Multiple Email Clients:** Test in Gmail, Outlook, Apple Mail

### 4.2 Monitoring

**Check Resend Dashboard:**
- Go to https://resend.com/emails
- Monitor delivery rate (should be >99%)
- Watch for bounces
- Check for spam complaints

**Check Supabase Logs:**
```bash
# Monitor edge function logs
supabase functions logs send-receipt-email --tail

# Check for errors
supabase functions logs send-receipt-email | grep -i error
```

**Query Database:**
```sql
-- Check receipt success rate
SELECT
  COUNT(*) as total_completed_payments,
  SUM(CASE WHEN receipt_sent THEN 1 ELSE 0 END) as receipts_sent,
  ROUND(100.0 * SUM(CASE WHEN receipt_sent THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM payment_transactions
WHERE status = 'completed'
AND created_at > NOW() - INTERVAL '7 days';

-- Find failed receipts (completed payments without receipts)
SELECT
  pt.id,
  pt.created_at,
  p.email,
  pt.amount,
  pt.currency
FROM payment_transactions pt
JOIN profiles p ON pt.user_id = p.id
WHERE pt.status = 'completed'
AND pt.receipt_sent = false
ORDER BY pt.created_at DESC;
```

---

## Step 5: Additional Production Configurations

### 5.1 Set Up Email Reply-To (Optional)

If you want replies to go to a specific email:

```typescript
// In the Resend API call (around line 398)
body: JSON.stringify({
  from: 'ExamV2 <receipts@yourdomain.com>',
  reply_to: 'support@yourdomain.com',  // <- ADD THIS
  to: [receiptData.userEmail],
  subject: `Payment Receipt - ${receiptData.tierName} Subscription`,
  html: htmlContent
})
```

### 5.2 Add Email Tracking (Optional)

Track opens and clicks:

```typescript
body: JSON.stringify({
  from: 'ExamV2 <receipts@yourdomain.com>',
  to: [receiptData.userEmail],
  subject: `Payment Receipt - ${receiptData.tierName} Subscription`,
  html: htmlContent,
  tags: [  // <- ADD THIS
    { name: 'category', value: 'payment-receipt' },
    { name: 'tier', value: receiptData.tierName },
    { name: 'billing_cycle', value: receiptData.billingCycle }
  ]
})
```

Then view analytics in Resend dashboard.

### 5.3 Set Up Webhooks (Optional)

Get notified when emails bounce or are marked as spam:

1. **In Resend Dashboard:**
   - Go to Settings → Webhooks
   - Click "Add Webhook"
   - Enter your webhook URL
   - Select events: `email.bounced`, `email.complained`

2. **Create webhook handler (Supabase Edge Function):**
   ```bash
   supabase functions new resend-webhook
   ```

3. **Handle events and update database**

### 5.4 Update Documentation

Update your README or docs with:
- Receipt email information
- What customers should expect
- Support contact for email issues
- Spam folder instructions

---

## Step 6: Going Live

### 6.1 Final Checks

Before enabling for all users:

- [ ] All tests passed
- [ ] Domain verified in Resend
- [ ] Edge function deployed with production domain
- [ ] Monitoring set up
- [ ] Team notified
- [ ] Support team briefed
- [ ] Documentation updated

### 6.2 Deployment

```bash
# Final deployment
git add .
git commit -m "Production-ready receipt email system"
git push

# Deploy edge function
supabase functions deploy send-receipt-email

# Verify
supabase functions list
```

### 6.3 Gradual Rollout (Recommended)

**Option 1: Feature Flag**
- Enable for 10% of users first
- Monitor for issues
- Gradually increase to 100%

**Option 2: Soft Launch**
- Enable for new payments only
- Keep monitoring existing users
- Full rollout after 48 hours

---

## Troubleshooting Production Issues

### Issue: Receipts Going to Spam

**Solutions:**
1. Ensure SPF and DKIM records are added
2. Warm up your domain (send gradually increasing volumes)
3. Ask customers to whitelist your email
4. Use a subdomain like `mail.yourdomain.com`
5. Ensure content doesn't trigger spam filters

### Issue: Emails Not Sending

**Check:**
1. Domain verification status in Resend
2. DNS records are correct
3. Edge function logs: `supabase functions logs send-receipt-email`
4. Resend dashboard for errors
5. API key is correct: `supabase secrets list`

### Issue: High Bounce Rate

**Solutions:**
1. Validate email addresses before accepting
2. Implement email verification during signup
3. Clean email list regularly
4. Use double opt-in

### Issue: Low Open Rates

**Solutions:**
1. Improve subject line
2. Send from a recognizable sender name
3. Ensure emails aren't in spam
4. Test different send times

---

## Cost Considerations

### Resend Pricing (as of 2024)

**Free Tier:**
- 3,000 emails/month
- 100 emails/day
- Perfect for: ~100 payments/day

**Pro Tier ($20/month):**
- 50,000 emails/month
- $1 per 1,000 additional
- Perfect for: ~1,600 payments/day

**Scale Tier (Custom):**
- For high-volume businesses
- Contact Resend sales

**When to upgrade:**
- Hitting daily/monthly limits
- Need better deliverability features
- Require dedicated IP
- Need advanced analytics

---

## Maintenance

### Regular Tasks

**Weekly:**
- [ ] Check Resend dashboard for issues
- [ ] Review edge function logs
- [ ] Check receipt success rate in database

**Monthly:**
- [ ] Review email analytics
- [ ] Check for failed receipts and resend
- [ ] Update template if needed
- [ ] Review bounce/complaint rates

**Quarterly:**
- [ ] Test entire flow end-to-end
- [ ] Review and optimize template
- [ ] Check competitor receipts for ideas
- [ ] Update branding if changed

---

## Summary Checklist

✅ **Setup (One-time):**
- [ ] Purchase/select domain
- [ ] Verify domain in Resend
- [ ] Update sender email in code
- [ ] Customize email template
- [ ] Deploy edge function
- [ ] Test thoroughly

✅ **Ongoing:**
- [ ] Monitor delivery rates
- [ ] Handle failed receipts
- [ ] Keep template updated
- [ ] Maintain good sender reputation

---

## Support Resources

**Resend Documentation:**
- API Docs: https://resend.com/docs
- Domain Setup: https://resend.com/docs/dashboard/domains/introduction
- Best Practices: https://resend.com/docs/knowledge-base/sending-best-practices

**Email Testing Tools:**
- Mail Tester: https://www.mail-tester.com
- DNS Checker: https://dnschecker.org
- Email Preview: https://www.htmlemailcheck.com

**Need Help?**
- Resend Support: support@resend.com
- Resend Status: https://status.resend.com
- Community: https://discord.gg/resend

---

## Quick Reference

**Development:**
```typescript
from: 'ExamV2 <onboarding@resend.dev>'  // Test domain
```

**Production:**
```typescript
from: 'ExamV2 <receipts@yourdomain.com>'  // Your domain
```

**Deploy:**
```bash
supabase functions deploy send-receipt-email
```

**Monitor:**
```bash
supabase functions logs send-receipt-email --tail
```

**Test:**
- Make a payment
- Check email (inbox and spam)
- Verify all details are correct

---

**You're ready for production! 🚀**

Once you've verified your domain and updated the sender email, receipts will be sent automatically to all your customers after every successful payment.
