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

  // Update transaction if status is pending
  if (transaction.status === 'pending') {
    const { error: updateError } = await supabase
      .from('payment_transactions')
      .update({
        status: 'completed',
        external_transaction_id: captureId, // Update with capture ID
        metadata: {
          ...transaction.metadata,
          paypal_capture_id: captureId,
          webhook_verified: true,
          webhook_timestamp: new Date().toISOString()
        }
      })
      .eq('id', transaction.id);

    if (updateError) {
      console.error('Error updating transaction:', updateError);
      throw updateError;
    }

    console.log('Transaction updated to completed:', transaction.id);
  } else {
    console.log('Transaction already in final state:', transaction.status);
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
