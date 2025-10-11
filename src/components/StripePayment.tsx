import { useState } from 'react';
import { ArrowLeft, CreditCard, Loader2, CheckCircle } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { PaymentMethod, PaymentSelectionData } from '../types/payment';

// TODO: Replace with your Stripe publishable key (test mode)
const stripePromise = loadStripe('pk_test_51SH0xvCDkfruimlwdFlj8SaZhpDyrjcl1lMzCtOtKyrst5upXG3rscpavu1wStepSleqyD3SDrHxXV7DHcAei0BB00rxHlIwja');

interface StripePaymentProps {
  paymentData: PaymentSelectionData;
  paymentMethod: PaymentMethod;
  onBack: () => void;
  onSuccess: () => void;
}

function StripeCheckoutForm({
  paymentData,
  paymentMethod,
  onBack,
  onSuccess
}: StripePaymentProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { user } = useAuth();

  const [processing, setProcessing] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [error, setError] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || !user) {
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) throw new Error('Card element not found');

      // Create payment transaction in database
      const { data: transaction, error: transactionError } = await supabase
        .from('payment_transactions')
        .insert({
          user_id: user.id,
          tier_id: paymentData.tierId,
          payment_method_id: paymentMethod.id,
          amount: paymentData.amount,
          currency: 'USD',
          billing_cycle: paymentData.billingCycle,
          status: 'pending',
          selected_grade_id: paymentData.selectedGradeId,
          selected_subject_ids: paymentData.selectedSubjectIds,
          metadata: {
            tier_name: paymentData.tierName
          }
        })
        .select()
        .single();

      if (transactionError) throw transactionError;

      // Create a payment method with Stripe
      // NOTE: In production, you should create a Payment Intent via your backend API
      // For test mode, we'll create a payment method and simulate successful payment
      const { error: paymentMethodError, paymentMethod: stripePaymentMethod } = await stripe.createPaymentMethod({
        type: 'card',
        card: cardElement,
        billing_details: {
          email: user.email,
        },
      });

      if (paymentMethodError) {
        throw new Error(paymentMethodError.message);
      }

      // Simulate successful payment for test mode
      // In production, you would call your backend API here to create a Payment Intent:
      // const response = await fetch('/api/stripe/create-payment-intent', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     amount: paymentData.amount * 100, // Convert to cents
      //     currency: 'usd',
      //     payment_method: stripePaymentMethod.id
      //   })
      // });
      // const { client_secret } = await response.json();
      // const { error, paymentIntent } = await stripe.confirmCardPayment(client_secret);

      // For test mode: Mark transaction as completed immediately
      const testTransactionId = `test_${stripePaymentMethod.id}_${Date.now()}`;

      const { error: updateError } = await supabase
        .from('payment_transactions')
        .update({
          status: 'completed',
          external_transaction_id: testTransactionId,
          metadata: {
            tier_name: paymentData.tierName,
            test_mode: true,
            stripe_payment_method_id: stripePaymentMethod.id
          }
        })
        .eq('id', transaction.id);

      if (updateError) throw updateError;

      setSucceeded(true);
      setTimeout(() => onSuccess(), 2000);

    } catch (err: any) {
      console.error('Stripe payment error:', err);
      setError(err.message || 'Payment failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  if (succeeded) {
    return (
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Payment Successful!</h2>
        <p className="text-gray-600">
          Your subscription has been activated. Redirecting...
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm">Back to payment methods</span>
        </button>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Card Payment</h2>
        <p className="text-gray-600">
          Complete payment for <strong>{paymentData.tierName}</strong> ({paymentData.billingCycle})
        </p>
      </div>

      {/* Payment Amount */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between">
          <span className="text-gray-700 font-medium">Total Amount:</span>
          <div className="text-right">
            <p className="text-3xl font-bold text-gray-900">${paymentData.amount}</p>
            <p className="text-sm text-gray-500">USD</p>
          </div>
        </div>
      </div>

      {/* Payment Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Card Element */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Card Details
          </label>
          <div className="border border-gray-300 rounded-lg p-4">
            <CardElement
              options={{
                style: {
                  base: {
                    fontSize: '16px',
                    color: '#111827',
                    '::placeholder': {
                      color: '#9CA3AF',
                    },
                  },
                  invalid: {
                    color: '#EF4444',
                  },
                },
              }}
            />
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!stripe || processing}
          className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {processing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Processing...</span>
            </>
          ) : (
            <>
              <CreditCard className="w-5 h-5" />
              <span>Pay ${paymentData.amount}</span>
            </>
          )}
        </button>
      </form>

      {/* Security Info */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>🔒 Secure Payment:</strong> Your payment is processed securely through Stripe. We never store your card details.
        </p>
      </div>

      {/* Test Mode Notice */}
      <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-800 mb-2">
          <strong>⚠️ Test Mode:</strong> This is a simulated payment for testing purposes.
        </p>
        <p className="text-xs text-yellow-700">
          Use test card: <strong>4242 4242 4242 4242</strong> (any future date, any CVC)
        </p>
        <p className="text-xs text-yellow-700 mt-1">
          No real charges will be made. In production, this will use actual Stripe Payment Intents.
        </p>
      </div>
    </div>
  );
}

export function StripePayment(props: StripePaymentProps) {
  return (
    <Elements stripe={stripePromise}>
      <StripeCheckoutForm {...props} />
    </Elements>
  );
}
