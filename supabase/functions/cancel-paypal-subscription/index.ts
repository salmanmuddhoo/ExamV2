import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CancelRequest {
  userId: string;
  reason?: string;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const paypalClientId = Deno.env.get('PAYPAL_CLIENT_ID');
    const paypalClientSecret = Deno.env.get('PAYPAL_CLIENT_SECRET');
    const paypalApiBase = Deno.env.get('PAYPAL_API_BASE') || 'https://api-m.paypal.com';

    if (!paypalClientId || !paypalClientSecret) {
      throw new Error('PayPal credentials not configured');
    }

    const { userId, reason }: CancelRequest = await req.json();

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Missing userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Cancelling PayPal subscription for user: ${userId}`);

    // Get user's active PayPal subscription
    const { data: subscription, error: subError } = await supabase
      .from('user_subscriptions')
      .select('id, payment_id, payment_provider, status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .eq('payment_provider', 'paypal')
      .single();

    if (subError || !subscription) {
      console.log('No active PayPal subscription found for user');
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No active PayPal subscription found'
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!subscription.payment_id) {
      console.error('Subscription found but no PayPal subscription ID');
      return new Response(
        JSON.stringify({
          success: false,
          message: 'No PayPal subscription ID found'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const paypalSubscriptionId = subscription.payment_id;
    console.log(`PayPal Subscription ID: ${paypalSubscriptionId}`);

    // Get PayPal access token
    const authResponse = await fetch(`${paypalApiBase}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${paypalClientId}:${paypalClientSecret}`)}`
      },
      body: 'grant_type=client_credentials'
    });

    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      console.error('PayPal auth failed:', errorText);
      throw new Error('Failed to authenticate with PayPal');
    }

    const authData = await authResponse.json();
    const accessToken = authData.access_token;

    // Cancel the PayPal subscription
    const cancelResponse = await fetch(
      `${paypalApiBase}/v1/billing/subscriptions/${paypalSubscriptionId}/cancel`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          reason: reason || 'User requested cancellation'
        })
      }
    );

    // PayPal returns 204 No Content on successful cancellation
    if (cancelResponse.status === 204) {
      console.log('✅ PayPal subscription cancelled successfully');

      // Update our database to mark subscription as cancelled
      const { error: updateError } = await supabase
        .from('user_subscriptions')
        .update({
          status: 'cancelled',
          cancel_at_period_end: false, // No longer needed since it's cancelled now
          cancellation_reason: reason || 'User requested cancellation',
          cancellation_requested_at: new Date().toISOString(),
          cancelled_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', subscription.id);

      if (updateError) {
        console.error('Failed to update subscription in database:', updateError);
        // PayPal subscription is cancelled, but our DB update failed
        // This is not critical but should be logged
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'PayPal subscription cancelled successfully'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      const errorText = await cancelResponse.text();
      console.error(`PayPal cancellation failed (${cancelResponse.status}):`, errorText);

      // Check if subscription is already cancelled
      if (cancelResponse.status === 422 && errorText.includes('SUBSCRIPTION_STATUS_INVALID')) {
        console.log('Subscription already cancelled in PayPal, updating our database');

        // Update our database
        const { error: updateError } = await supabase
          .from('user_subscriptions')
          .update({
            status: 'cancelled',
            cancel_at_period_end: false,
            cancellation_reason: 'Already cancelled in PayPal',
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', subscription.id);

        if (updateError) {
          console.error('Failed to update subscription:', updateError);
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: 'Subscription already cancelled'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      throw new Error(`PayPal cancellation failed: ${errorText}`);
    }

  } catch (error: any) {
    console.error('Error cancelling PayPal subscription:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to cancel PayPal subscription'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
