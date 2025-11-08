import { useState, useEffect } from 'react';
import { ArrowLeft, CreditCard, Loader2, CheckCircle } from 'lucide-react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { sendReceiptEmailWithRetry } from '../lib/receiptUtils';
import type { PaymentMethod, PaymentSelectionData } from '../types/payment';

// TODO: Replace with your Stripe publishable key (test mode)
const stripePromise = loadStripe('pk_test_51SH0xvCDkfruimlwdFlj8SaZhpDyrjcl1lMzCtOtKyrst5upXG3rscpavu1wStepSleqyD3SDrHxXV7DHcAei0BB00rxHlIwja');

interface CouponData {
  code: string;
  discountPercentage: number;
  discountAmount: number;
  finalAmount: number;
}

interface StripePaymentProps {
  paymentData: PaymentSelectionData;
  paymentMethod: PaymentMethod;
  onBack: () => void;
  onSuccess: () => void;
  hideBackButton?: boolean;
  couponData?: CouponData;
}

function StripeCheckoutForm({
  paymentData,
  paymentMethod,
  onBack,
  onSuccess,
  hideBackButton = false,
  couponData
}: StripePaymentProps) {
  const stripe = useStripe();
  const elements = useElements();
  const { user } = useAuth();

  const [processing, setProcessing] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [error, setError] = useState<string>('');
  const [exchangeRate, setExchangeRate] = useState<number>(45.5);

  // Fetch exchange rate from database
  useEffect(() => {
    const fetchExchangeRate = async () => {
      try {
        const { data, error } = await supabase
          .from('currency_exchange_rates')
          .select('rate_to_usd')
          .eq('currency_code', 'MUR')
          .single();

        if (!error && data) {
          setExchangeRate(data.rate_to_usd);
        }
      } catch (err) {
        console.error('Error fetching exchange rate:', err);
      }
    };
    fetchExchangeRate();
  }, []);

  // Convert amount to USD if needed (Stripe only supports USD)
  const convertToUSD = (amount: number, currency: string) => {
    if (currency === 'USD') return amount;
    if (currency === 'MUR') {
      return Number((amount / exchangeRate).toFixed(2));
    }
    return amount; // Default fallback
  };

  const displayAmountUSD = convertToUSD(paymentData.amount, paymentData.currency);
  const displayFinalUSD = couponData ? couponData.finalAmount : displayAmountUSD;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements || !user) {
      return;
    }

    setProcessing(true);
    setError('');

    let transactionId: string | null = null;

    try {
      const cardElement = elements.getElement(CardElement);
      if (!cardElement) throw new Error('Card element not found');

      // Create a payment method with Stripe FIRST
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

      // Debug logging for payment data

      // Calculate final amount (use coupon final amount if present, otherwise original amount)
      const baseAmount = paymentData.amount;
      const baseCurrency = paymentData.currency;
      const originalAmountUSD = convertToUSD(baseAmount, baseCurrency);
      const finalAmount = couponData ? couponData.finalAmount : originalAmountUSD;
      const originalAmount = originalAmountUSD;

      // Only create transaction AFTER Stripe payment method is successful
      const { data: transaction, error: transactionError } = await supabase
        .from('payment_transactions')
        .insert({
          user_id: user.id,
          tier_id: paymentData.tierId,
          payment_method_id: paymentMethod.id,
          amount: finalAmount,
          currency: 'USD',
          billing_cycle: paymentData.billingCycle,
          status: 'pending',
          selected_grade_id: paymentData.selectedGradeId,
          selected_subject_ids: paymentData.selectedSubjectIds,
          metadata: {
            tier_name: paymentData.tierName,
            original_amount: originalAmount,
            ...(couponData && {
              coupon_code: couponData.code,
              discount_percentage: couponData.discountPercentage,
              discount_amount: couponData.discountAmount
            })
          }
        })
        .select()
        .single();


      if (transactionError) throw transactionError;
      transactionId = transaction.id;

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
            stripe_payment_method_id: stripePaymentMethod.id,
            original_amount: originalAmount,
            ...(couponData && {
              coupon_code: couponData.code,
              discount_percentage: couponData.discountPercentage,
              discount_amount: couponData.discountAmount
            })
          }
        })
        .eq('id', transaction.id);

      if (updateError) throw updateError;

      // Apply coupon if present
      if (couponData) {
        const { data: couponResult, error: couponError } = await supabase.rpc('apply_coupon_code', {
          p_coupon_code: couponData.code,
          p_payment_transaction_id: transaction.id,
          p_original_amount: originalAmount,
          p_currency: 'USD'
        });

        if (couponError) {
          // Don't fail the payment, just log the error
        } else {
        }
      }

      // Send receipt email (non-blocking)
      sendReceiptEmailWithRetry(transaction.id).catch(error => {
        // Don't fail the payment if receipt fails
      });

      setSucceeded(true);
      setTimeout(() => onSuccess(), 2000);

    } catch (err: any) {
      setError(err.message || 'Payment failed. Please try again.');

      // Clean up: Delete the pending transaction if it was created
      if (transactionId) {
        try {
          await supabase
            .from('payment_transactions')
            .delete()
            .eq('id', transactionId);
        } catch (deleteError) {
        }
      }
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
      {/* Stripe Header Banner */}
      <div className="mb-6 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-lg p-6 text-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="bg-white rounded-lg p-2 flex items-center justify-center">
              <svg className="w-16 h-8" viewBox="0 0 60 25" fill="none">
                <path d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a8.33 8.33 0 01-4.56 1.1c-4.01 0-6.83-2.5-6.83-7.48 0-4.19 2.39-7.52 6.3-7.52 3.92 0 5.96 3.28 5.96 7.5 0 .4-.04 1.26-.06 1.48zm-5.92-5.62c-1.03 0-2.17.73-2.17 2.58h4.25c0-1.85-1.07-2.58-2.08-2.58zM40.95 20.3c-1.44 0-2.32-.6-2.9-1.04l-.02 4.63-4.12.87V5.57h3.76l.08 1.02a4.7 4.7 0 013.23-1.29c2.9 0 5.62 2.6 5.62 7.4 0 5.23-2.7 7.6-5.65 7.6zM40 8.95c-.95 0-1.54.34-1.97.81l.02 6.12c.4.44.98.78 1.95.78 1.52 0 2.54-1.65 2.54-3.87 0-2.15-1.04-3.84-2.54-3.84zM28.24 5.57h4.13v14.44h-4.13V5.57zm0-4.7L32.37 0v3.36l-4.13.88V.88zm-4.32 9.35v9.79H19.8V5.57h3.7l.12 1.22c1-1.77 3.07-1.41 3.62-1.22v3.79c-.52-.17-2.29-.43-3.32.86zm-8.55 4.72c0 2.43 2.6 1.68 3.12 1.46v3.36c-.55.3-1.54.54-2.89.54a4.15 4.15 0 01-4.27-4.24l.01-13.17 4.02-.86v3.54h3.14V9.1h-3.13v5.85zm-4.91.7c0 2.97-2.31 4.66-5.73 4.66a11.2 11.2 0 01-4.46-.93v-3.93c1.38.75 3.1 1.31 4.46 1.31.92 0 1.53-.24 1.53-1C6.26 13.77 0 14.51 0 9.95 0 7.04 2.28 5.3 5.62 5.3c1.36 0 2.72.2 4.09.75v3.88a9.23 9.23 0 00-4.1-1.06c-.86 0-1.44.25-1.44.9 0 1.85 6.29.97 6.29 5.88z" fill="#635BFF"/>
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-bold">Stripe Payment</h3>
              <p className="text-sm text-indigo-100">Fast, secure card payments</p>
            </div>
          </div>
          {!hideBackButton && (
            <button
              onClick={onBack}
              className="flex items-center space-x-2 text-white hover:text-indigo-100 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back</span>
            </button>
          )}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-indigo-100">
            {paymentData.tierName} - {paymentData.billingCycle}
          </span>
          <div className="text-right">
            {couponData ? (
              <>
                <span className="text-sm line-through text-indigo-200 block">${displayAmountUSD}</span>
                <span className="text-2xl font-bold">${displayFinalUSD}</span>
              </>
            ) : (
              <span className="text-2xl font-bold">${displayAmountUSD}</span>
            )}
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Card Payment</h2>
        <p className="text-gray-600">
          Complete payment for <strong>{paymentData.tierName}</strong> ({paymentData.billingCycle})
        </p>
      </div>

      {/* Payment Amount */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
        {couponData ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-gray-300">
              <span className="text-gray-700">Original Amount:</span>
              <span className="text-lg text-gray-500 line-through">${displayAmountUSD}</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-gray-700 font-medium">Discount ({couponData.discountPercentage}%):</span>
                <div className="text-xs text-green-600 font-mono">Code: {couponData.code}</div>
              </div>
              <span className="text-lg text-green-600 font-semibold">-${couponData.discountAmount}</span>
            </div>
            <div className="flex items-center justify-between pt-3 border-t-2 border-gray-300">
              <span className="text-gray-900 font-bold">Total Amount:</span>
              <div className="text-right">
                <p className="text-3xl font-bold text-gray-900">${displayFinalUSD}</p>
                <p className="text-sm text-gray-500">USD</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-gray-700 font-medium">Total Amount:</span>
            <div className="text-right">
              <p className="text-3xl font-bold text-gray-900">${displayAmountUSD}</p>
              <p className="text-sm text-gray-500">USD</p>
            </div>
          </div>
        )}
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
              <span>Pay ${displayFinalUSD}</span>
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
