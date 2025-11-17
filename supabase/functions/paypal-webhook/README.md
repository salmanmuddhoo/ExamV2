# PayPal Webhook Handler

This Supabase Edge Function handles PayPal webhook events to verify and process payments.

## Deployment

### 1. Deploy the Function

```bash
npx supabase functions deploy paypal-webhook
```

### 2. Set Environment Variables

Set the following environment variables in your Supabase project:

```bash
# Required
npx supabase secrets set PAYPAL_CLIENT_ID=your_paypal_client_id
npx supabase secrets set PAYPAL_SECRET=your_paypal_secret

# Optional (for webhook signature verification - recommended for production)
npx supabase secrets set PAYPAL_WEBHOOK_ID=your_webhook_id

# Set PayPal mode (production or sandbox)
npx supabase secrets set PAYPAL_MODE=sandbox  # or 'production'
```

**Note**: For local development, add these to your `.env` file.

### 3. Configure PayPal Webhook

1. Log in to [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/)
2. Select your app (Sandbox or Live)
3. Scroll to **Webhooks** section
4. Click **Add Webhook**
5. Enter webhook URL:
   ```
   https://your-project-ref.supabase.co/functions/v1/paypal-webhook
   ```
   Replace `your-project-ref` with your actual Supabase project reference

6. Select the following event types:
   - `PAYMENT.CAPTURE.COMPLETED`
   - `PAYMENT.CAPTURE.DENIED`
   - `PAYMENT.CAPTURE.DECLINED`
   - `PAYMENT.CAPTURE.REFUNDED`

7. Click **Save**
8. Copy the **Webhook ID** and set it as the `PAYPAL_WEBHOOK_ID` environment variable (for signature verification)

## Webhook Events Handled

### PAYMENT.CAPTURE.COMPLETED
- Triggered when a payment is successfully captured
- Updates transaction status to `completed`
- Adds webhook verification metadata

### PAYMENT.CAPTURE.DENIED / DECLINED
- Triggered when a payment fails
- Updates transaction status to `failed`
- Stores failure reason in metadata

### PAYMENT.CAPTURE.REFUNDED
- Triggered when a payment is refunded
- Updates transaction status to `refunded`
- Stores refund details in metadata

## Security

### Webhook Signature Verification

For production, enable webhook signature verification by:

1. Uncomment the verification code in `index.ts` (lines ~52-67)
2. Ensure `PAYPAL_WEBHOOK_ID`, `PAYPAL_CLIENT_ID`, and `PAYPAL_SECRET` are set
3. The function will verify that webhooks are genuinely from PayPal

### Environment Variables Required for Verification

```bash
PAYPAL_WEBHOOK_ID=your_webhook_id
PAYPAL_CLIENT_ID=your_client_id
PAYPAL_SECRET=your_client_secret
```

## Testing

### Test in Sandbox Mode

1. Set `PAYPAL_MODE=sandbox`
2. Use PayPal sandbox credentials
3. Make a test payment in your application
4. Check PayPal Developer Dashboard → Webhooks → Event History
5. Verify the webhook was received (status should be 200)

### Test Webhook Manually

You can resend webhooks from PayPal Developer Dashboard:

1. Go to **Webhooks** → **Event History**
2. Find the event you want to resend
3. Click **Resend**
4. Check your Supabase logs to verify it was processed

### View Logs

```bash
npx supabase functions logs paypal-webhook
```

Or view in Supabase Dashboard → Edge Functions → Logs

## Troubleshooting

### 404 Not Found
- Ensure the function is deployed: `npx supabase functions deploy paypal-webhook`
- Check the webhook URL is correct in PayPal settings
- Verify the function exists in Supabase Dashboard

### Transaction Not Found
- This is normal if the frontend already created the transaction
- The webhook serves as a backup/verification mechanism
- Check that `external_transaction_id` matches PayPal order ID or capture ID

### Signature Verification Failed
- Verify `PAYPAL_WEBHOOK_ID` is correct
- Ensure client credentials are correct
- Check that you're using the correct mode (sandbox vs production)

### Transaction Already Completed
- This is normal - webhooks may arrive after frontend processing
- The function skips updating transactions already in final state

## Integration with Frontend

The frontend (`PayPalPayment.tsx`) handles payment capture in the `onApprove` callback. The webhook serves as:

1. **Backup verification**: In case frontend fails to update the database
2. **Asynchronous updates**: For events like refunds that happen outside the payment flow
3. **Audit trail**: Provides webhook verification metadata

Both frontend and webhook can update the same transaction safely - the function checks transaction status before updating.

## Production Checklist

- [ ] Deploy function to production Supabase project
- [ ] Set production environment variables
- [ ] Configure webhook in PayPal Live app (not Sandbox)
- [ ] Enable signature verification (uncomment verification code)
- [ ] Test with small live payment
- [ ] Monitor webhook logs for errors
- [ ] Set up alerts for failed webhooks

## Related Files

- Frontend integration: `/src/components/PayPalPayment.tsx`
- Payment setup guide: `/PAYMENT_SETUP_GUIDE.md`
- Payment types: `/src/types/payment.ts`

## Support

For PayPal webhook documentation:
https://developer.paypal.com/docs/api-basics/notifications/webhooks/
