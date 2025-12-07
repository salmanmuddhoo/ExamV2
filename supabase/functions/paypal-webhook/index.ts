// Supabase Edge Function: PayPal Webhook Handler
// Handles PayPal webhook events for payment verification and processing

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const PAYPAL_WEBHOOK_ID = Deno.env.get('PAYPAL_WEBHOOK_ID');
const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID');
const PAYPAL_CLIENT_SECRET = Deno.env.get('PAYPAL_SECRET'); // Using PAYPAL_SECRET to match your env var
const PAYPAL_API_BASE = Deno.env.get('PAYPAL_MODE') === 'production'
  ? 'https://api.paypal.com'
  : 'https://api.sandbox.paypal.com';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Only accept POST requests
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Get webhook headers for verification
    const webhookHeaders = {
      'paypal-transmission-id': req.headers.get('paypal-transmission-id') || '',
      'paypal-transmission-time': req.headers.get('paypal-transmission-time') || '',
      'paypal-transmission-sig': req.headers.get('paypal-transmission-sig') || '',
      'paypal-cert-url': req.headers.get('paypal-cert-url') || '',
      'paypal-auth-algo': req.headers.get('paypal-auth-algo') || ''
    };

    // Parse webhook body
    const webhookBody = await req.text();
    const event = JSON.parse(webhookBody);

    console.log('PayPal webhook received:', {
      event_type: event.event_type,
      event_id: event.id,
      resource_type: event.resource_type
    });

    // Verify webhook signature (optional but recommended for production)
    // Uncomment when PAYPAL_WEBHOOK_ID is configured
    /*
    if (PAYPAL_WEBHOOK_ID) {
      const isValid = await verifyWebhookSignature(
        webhookBody,
        webhookHeaders,
        PAYPAL_WEBHOOK_ID
      );

      if (!isValid) {
        console.error('Invalid webhook signature');
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
    */

    // Initialize Supabase client
    const supabase = createClient(
      SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY!
    );

    // Handle different event types
    switch (event.event_type) {
      // One-time payment events
      case 'PAYMENT.CAPTURE.COMPLETED':
        await handlePaymentCaptureCompleted(event, supabase);
        break;

      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.DECLINED':
        await handlePaymentCaptureFailed(event, supabase);
        break;

      case 'PAYMENT.CAPTURE.REFUNDED':
        await handlePaymentRefunded(event, supabase);
        break;

      // Recurring subscription events
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

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error processing webhook:', error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

// Handle successful payment capture
async function handlePaymentCaptureCompleted(event: any, supabase: any) {
  const capture = event.resource;
  const orderId = capture.supplementary_data?.related_ids?.order_id;
  const captureId = capture.id;
  const amount = parseFloat(capture.amount.value);
  const currency = capture.amount.currency_code;

  console.log('Processing payment capture:', {
    orderId,
    captureId,
    amount,
    currency
  });

  // Find transaction by PayPal order ID
  const { data: transaction, error: findError } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq('external_transaction_id', orderId)
    .single();

  if (findError || !transaction) {
    console.error('Transaction not found for order:', orderId);
    // This is not necessarily an error - the frontend may have already created
    // the transaction with the capture ID instead of order ID

    // Try finding by capture ID
    const { data: txByCaptureId } = await supabase
      .from('payment_transactions')
      .select('*')
      .eq('external_transaction_id', captureId)
      .single();

    if (txByCaptureId) {
      console.log('Transaction already exists with capture ID');
      return;
    }

    console.log('Transaction not found - may have been created by frontend');
    return;
  }

  // Update transaction if status is pending or needs webhook verification
  if (transaction.status === 'pending' || transaction.status === 'completed') {
    // Merge webhook data with existing metadata
    const updatedMetadata = {
      ...transaction.metadata,
      paypal_capture_id: captureId,
      webhook_verified: true,
      webhook_timestamp: new Date().toISOString(),
      paypal_capture_details: {
        id: captureId,
        amount: amount,
        currency: currency,
        status: capture.status,
        create_time: capture.create_time,
        update_time: capture.update_time
      }
    };

    const { error: updateError } = await supabase
      .from('payment_transactions')
      .update({
        status: 'completed',
        external_transaction_id: captureId, // Update with capture ID
        metadata: updatedMetadata
      })
      .eq('id', transaction.id);

    if (updateError) {
      console.error('Error updating transaction:', updateError);
      throw updateError;
    }

    console.log('Transaction updated with webhook verification:', transaction.id);
  } else {
    console.log('Transaction in final state, not updating:', transaction.status);
  }
}

// Handle failed payment
async function handlePaymentCaptureFailed(event: any, supabase: any) {
  const capture = event.resource;
  const orderId = capture.supplementary_data?.related_ids?.order_id;

  console.log('Processing failed payment:', orderId);

  // Find and update transaction
  const { error: updateError } = await supabase
    .from('payment_transactions')
    .update({
      status: 'failed',
      metadata: {
        failure_reason: event.summary,
        webhook_event: event.event_type,
        webhook_timestamp: new Date().toISOString()
      }
    })
    .eq('external_transaction_id', orderId);

  if (updateError) {
    console.error('Error updating failed transaction:', updateError);
  }
}

// Handle refunded payment
async function handlePaymentRefunded(event: any, supabase: any) {
  const refund = event.resource;
  const captureId = refund.links?.find((l: any) => l.rel === 'up')?.href?.split('/').pop();

  console.log('Processing refund for capture:', captureId);

  // Find transaction and mark as refunded
  const { error: updateError } = await supabase
    .from('payment_transactions')
    .update({
      status: 'refunded',
      metadata: {
        refund_id: refund.id,
        refund_amount: refund.amount.value,
        refund_timestamp: new Date().toISOString()
      }
    })
    .eq('external_transaction_id', captureId);

  if (updateError) {
    console.error('Error updating refunded transaction:', updateError);
  }

  // TODO: Consider cancelling subscription if refunded
}

// ============================================
// SUBSCRIPTION EVENT HANDLERS
// ============================================

// Handle subscription created event
async function handleSubscriptionCreated(event: any, supabase: any) {
  const subscription = event.resource;
  const subscriptionId = subscription.id;

  console.log('Subscription created:', subscriptionId);

  // Fetch existing transaction to preserve metadata
  const { data: existingTx, error: fetchError } = await supabase
    .from('payment_transactions')
    .select('metadata')
    .eq('paypal_subscription_id', subscriptionId)
    .single();

  if (fetchError) {
    console.error('Error fetching transaction:', fetchError);
    return;
  }

  // Merge webhook data with existing metadata
  const updatedMetadata = {
    ...existingTx.metadata,
    subscription_created: true,
    subscription_create_time: subscription.create_time,
    subscription_status: subscription.status,
    webhook_create_time: new Date().toISOString()
  };

  // Update transaction with merged metadata
  const { error } = await supabase
    .from('payment_transactions')
    .update({ metadata: updatedMetadata })
    .eq('paypal_subscription_id', subscriptionId);

  if (error) {
    console.error('Error updating subscription created:', error);
  }
}

// Handle subscription activated event
async function handleSubscriptionActivated(event: any, supabase: any) {
  const subscription = event.resource;
  const subscriptionId = subscription.id;

  console.log('Subscription activated:', subscriptionId);

  // First, fetch existing transaction to preserve metadata
  const { data: existingTx, error: fetchError } = await supabase
    .from('payment_transactions')
    .select('metadata')
    .eq('paypal_subscription_id', subscriptionId)
    .single();

  if (fetchError) {
    console.error('Error fetching transaction:', fetchError);
    return;
  }

  // Merge webhook data with existing metadata
  const updatedMetadata = {
    ...existingTx.metadata,
    subscription_activated: true,
    subscription_start_time: subscription.start_time,
    subscription_status: subscription.status,
    subscription_billing_info: subscription.billing_info,
    paypal_plan_id: subscription.plan_id,
    webhook_activation_time: new Date().toISOString(),
    paypal_subscription_details: {
      id: subscription.id,
      status: subscription.status,
      status_update_time: subscription.status_update_time,
      create_time: subscription.create_time,
      start_time: subscription.start_time
    }
  };

  // Update transaction with merged metadata
  const { error } = await supabase
    .from('payment_transactions')
    .update({
      status: 'completed',
      metadata: updatedMetadata
    })
    .eq('paypal_subscription_id', subscriptionId);

  if (error) {
    console.error('Error activating subscription:', error);
  }

  console.log('Subscription activated and metadata updated successfully');
}

// Handle subscription cancelled event
async function handleSubscriptionCancelled(event: any, supabase: any) {
  const subscription = event.resource;
  const subscriptionId = subscription.id;

  console.log('Subscription cancelled:', subscriptionId);

  // Fetch existing transaction to preserve metadata
  const { data: existingTx, error: fetchError } = await supabase
    .from('payment_transactions')
    .select('metadata')
    .eq('paypal_subscription_id', subscriptionId)
    .eq('payment_type', 'recurring')
    .single();

  if (fetchError) {
    console.error('Error fetching transaction:', fetchError);
    return;
  }

  // Merge webhook data with existing metadata
  const updatedMetadata = {
    ...existingTx.metadata,
    subscription_cancelled: true,
    subscription_cancel_time: new Date().toISOString(),
    cancellation_note: subscription.status_update_reason || 'User cancelled via PayPal',
    paypal_cancellation_details: {
      status: subscription.status,
      status_update_time: subscription.status_update_time,
      reason: subscription.status_update_reason
    }
  };

  // Mark subscription as cancelled
  const { error } = await supabase
    .from('payment_transactions')
    .update({
      status: 'cancelled',
      metadata: updatedMetadata
    })
    .eq('paypal_subscription_id', subscriptionId)
    .eq('payment_type', 'recurring');

  if (error) {
    console.error('Error cancelling subscription:', error);
  }

  console.log('Subscription marked as cancelled with full details');
}

// Handle subscription suspended event
async function handleSubscriptionSuspended(event: any, supabase: any) {
  const subscription = event.resource;
  const subscriptionId = subscription.id;

  console.log('Subscription suspended:', subscriptionId);

  // Fetch existing transaction to preserve metadata
  const { data: existingTx, error: fetchError } = await supabase
    .from('payment_transactions')
    .select('metadata')
    .eq('paypal_subscription_id', subscriptionId)
    .eq('payment_type', 'recurring')
    .single();

  if (fetchError) {
    console.error('Error fetching transaction:', fetchError);
    return;
  }

  // Merge webhook data with existing metadata
  const updatedMetadata = {
    ...existingTx.metadata,
    subscription_suspended: true,
    suspension_time: new Date().toISOString(),
    suspension_reason: subscription.status_update_reason || 'Payment failure',
    paypal_suspension_details: {
      status: subscription.status,
      status_update_time: subscription.status_update_time,
      reason: subscription.status_update_reason
    }
  };

  // Mark subscription as suspended
  const { error } = await supabase
    .from('payment_transactions')
    .update({
      status: 'suspended',
      metadata: updatedMetadata
    })
    .eq('paypal_subscription_id', subscriptionId)
    .eq('payment_type', 'recurring');

  if (error) {
    console.error('Error suspending subscription:', error);
  }

  console.log('Subscription suspended with full details - usually due to payment failure');
}

// Handle subscription expired event
async function handleSubscriptionExpired(event: any, supabase: any) {
  const subscription = event.resource;
  const subscriptionId = subscription.id;

  console.log('Subscription expired:', subscriptionId);

  // Fetch existing transaction to preserve metadata
  const { data: existingTx, error: fetchError } = await supabase
    .from('payment_transactions')
    .select('metadata')
    .eq('paypal_subscription_id', subscriptionId)
    .eq('payment_type', 'recurring')
    .single();

  if (fetchError) {
    console.error('Error fetching transaction:', fetchError);
    return;
  }

  // Merge webhook data with existing metadata
  const updatedMetadata = {
    ...existingTx.metadata,
    subscription_expired: true,
    expiration_time: new Date().toISOString(),
    paypal_expiration_details: {
      status: subscription.status,
      status_update_time: subscription.status_update_time
    }
  };

  // Mark subscription as expired
  const { error } = await supabase
    .from('payment_transactions')
    .update({
      status: 'expired',
      metadata: updatedMetadata
    })
    .eq('paypal_subscription_id', subscriptionId)
    .eq('payment_type', 'recurring');

  if (error) {
    console.error('Error expiring subscription:', error);
  }

  console.log('Subscription expired with full details - user will be downgraded to free tier');
}

// Handle recurring payment event (monthly/yearly charge)
async function handleRecurringPayment(event: any, supabase: any) {
  const sale = event.resource;
  const subscriptionId = sale.billing_agreement_id;
  const saleId = sale.id;
  const amount = parseFloat(sale.amount.total);
  const currency = sale.amount.currency;

  console.log('Recurring payment received:', saleId, 'for subscription:', subscriptionId);

  // Find the original subscription transaction
  const { data: originalTransaction } = await supabase
    .from('payment_transactions')
    .select('user_id, tier_id, payment_method_id, billing_cycle, selected_grade_id, selected_subject_ids')
    .eq('paypal_subscription_id', subscriptionId)
    .eq('payment_type', 'recurring')
    .single();

  if (!originalTransaction) {
    console.error('Original subscription transaction not found for:', subscriptionId);
    return;
  }

  // Create new transaction record for the recurring payment with comprehensive metadata
  const { data: transaction, error } = await supabase
    .from('payment_transactions')
    .insert({
      user_id: originalTransaction.user_id,
      tier_id: originalTransaction.tier_id,
      payment_method_id: originalTransaction.payment_method_id,
      amount: amount,
      currency: currency,
      billing_cycle: originalTransaction.billing_cycle,
      status: 'completed',
      payment_type: 'recurring',
      external_transaction_id: saleId,
      paypal_subscription_id: subscriptionId,
      selected_grade_id: originalTransaction.selected_grade_id,
      selected_subject_ids: originalTransaction.selected_subject_ids,
      metadata: {
        recurring_payment: true,
        payment_date: new Date().toISOString(),
        webhook_verified: true,
        paypal_sale_details: {
          id: saleId,
          amount: {
            total: sale.amount.total,
            currency: sale.amount.currency,
            details: sale.amount.details
          },
          state: sale.state,
          payment_mode: sale.payment_mode,
          protection_eligibility: sale.protection_eligibility,
          create_time: sale.create_time,
          update_time: sale.update_time,
          billing_agreement_id: subscriptionId
        },
        renewal_info: {
          cycle_number: sale.custom || 'N/A',
          is_auto_renewal: true,
          billing_cycle: originalTransaction.billing_cycle
        }
      }
    })
    .select()
    .single();

  if (error) {
    console.error('Error recording recurring payment:', error);
    return;
  }

  console.log('Recurring payment recorded with full PayPal details - user limits will be reset by trigger');

  // Send receipt email for the recurring payment
  try {
    const { error: emailError } = await supabase.functions.invoke('send-receipt-email', {
      body: { transactionId: transaction.id }
    });

    if (emailError) {
      console.error('Error sending receipt email for recurring payment:', emailError);
      // Don't fail the webhook - email is non-critical
    } else {
      console.log('Receipt email sent successfully for recurring payment:', transaction.id);
    }
  } catch (emailErr) {
    console.error('Failed to send receipt email:', emailErr);
    // Don't fail the webhook - email is non-critical
  }
}

// Verify webhook signature (for production use)
async function verifyWebhookSignature(
  webhookBody: string,
  headers: any,
  webhookId: string
): Promise<boolean> {
  try {
    // Get PayPal OAuth token
    const auth = btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`);
    const tokenResponse = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Verify webhook signature
    const verifyResponse = await fetch(
      `${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          transmission_id: headers['paypal-transmission-id'],
          transmission_time: headers['paypal-transmission-time'],
          cert_url: headers['paypal-cert-url'],
          auth_algo: headers['paypal-auth-algo'],
          transmission_sig: headers['paypal-transmission-sig'],
          webhook_id: webhookId,
          webhook_event: JSON.parse(webhookBody)
        })
      }
    );

    const verifyData = await verifyResponse.json();
    return verifyData.verification_status === 'SUCCESS';
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}
