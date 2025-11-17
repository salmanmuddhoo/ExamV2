import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, CheckCircle, Repeat, CreditCard } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { sendReceiptEmailWithRetry } from '../lib/receiptUtils';
import type { PaymentMethod, PaymentSelectionData } from '../types/payment';

// PayPal SDK types
declare global {
  interface Window {
    paypal?: any;
  }
}

interface CouponData {
  code: string;
  discountPercentage: number;
  discountAmount: number;
  finalAmount: number;
}

interface PayPalPaymentDualProps {
  paymentData: PaymentSelectionData;
  paymentMethod: PaymentMethod;
  onBack: () => void;
  onSuccess: () => void;
  hideBackButton?: boolean;
  couponData?: CouponData;
}

type PaymentType = 'one_time' | 'recurring';

export function PayPalPaymentDual({
  paymentData,
  paymentMethod,
  onBack,
  onSuccess,
  hideBackButton = false,
  couponData
}: PayPalPaymentDualProps) {
  const { user } = useAuth();
  const [sdkReady, setSdkReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [error, setError] = useState<string>('');
  const [exchangeRate, setExchangeRate] = useState<number | null>(null);
  const [loadingRate, setLoadingRate] = useState(true);
  const [paymentType, setPaymentType] = useState<PaymentType | null>(null);
  const [paypalPlanId, setPaypalPlanId] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);

  // PayPal client ID from environment variables
  const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID;

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
        } else {
          setExchangeRate(45.5);
        }
      } catch (err) {
        console.error('Error fetching exchange rate:', err);
        setExchangeRate(45.5);
      } finally {
        setLoadingRate(false);
      }
    };
    fetchExchangeRate();
  }, []);

  // Fetch PayPal Plan ID when recurring payment is selected
  useEffect(() => {
    if (paymentType === 'recurring') {
      const fetchPlanId = async () => {
        setLoadingPlan(true);
        try {
          const { data, error } = await supabase
            .from('paypal_subscription_plans')
            .select('paypal_plan_id')
            .eq('tier_id', paymentData.tierId)
            .eq('billing_cycle', paymentData.billingCycle)
            .eq('is_active', true)
            .single();

          if (!error && data) {
            setPaypalPlanId(data.paypal_plan_id);
          } else {
            setError('Recurring subscription plan not configured for this tier. Please choose one-time payment or contact support.');
            console.error('PayPal plan not found:', error);
          }
        } catch (err) {
          console.error('Error fetching PayPal plan:', err);
          setError('Failed to load subscription plan');
        } finally {
          setLoadingPlan(false);
        }
      };
      fetchPlanId();
    }
  }, [paymentType, paymentData.tierId, paymentData.billingCycle]);

  // Convert amount to USD if needed
  const convertToUSD = (amount: number, currency: string) => {
    if (currency === 'USD') return amount;
    if (currency === 'MUR' && exchangeRate) {
      return Number((amount / exchangeRate).toFixed(2));
    }
    return amount;
  };

  // Calculate amounts
  const displayAmountUSD = exchangeRate ? convertToUSD(paymentData.amount, paymentData.currency) : 0;
  const displayFinalUSD = exchangeRate
    ? (couponData ? convertToUSD(couponData.finalAmount, paymentData.currency) : displayAmountUSD)
    : 0;

  // Load PayPal SDK
  useEffect(() => {
    if (!PAYPAL_CLIENT_ID) {
      setError('PayPal is not configured. Please contact support.');
      return;
    }

    const script = document.createElement('script');
    // Include both intents
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD&disable-funding=card&vault=true&intent=subscription`;
    script.addEventListener('load', () => setSdkReady(true));
    script.addEventListener('error', () => {
      setError('Failed to load PayPal. Please try again or contact support.');
    });
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [PAYPAL_CLIENT_ID]);

  // Render PayPal buttons
  useEffect(() => {
    if (sdkReady && window.paypal && exchangeRate && paymentType) {
      // Don't render until we have plan ID for recurring
      if (paymentType === 'recurring' && !paypalPlanId) {
        return;
      }

      const container = document.querySelector('#paypal-button-container');
      if (container) {
        container.innerHTML = '';
      }

      // One-time payment buttons
      if (paymentType === 'one_time') {
        window.paypal.Buttons({
          createOrder: async (data: any, actions: any) => {
            const finalAmountUSD = displayFinalUSD;

            if (isNaN(finalAmountUSD) || finalAmountUSD < 0.01) {
              throw new Error(`Invalid payment amount: $${finalAmountUSD}`);
            }

            return actions.order.create({
              purchase_units: [{
                description: `${paymentData.tierName} - ${paymentData.billingCycle}${couponData ? ` (Coupon: ${couponData.code})` : ''}`,
                amount: {
                  currency_code: 'USD',
                  value: finalAmountUSD.toFixed(2),
                },
              }],
            });
          },

          onApprove: async (data: any, actions: any) => {
            setProcessing(true);
            try {
              const order = await actions.order.capture();
              if (!user) throw new Error('User not authenticated');

              const { data: transaction, error: transactionError } = await supabase
                .from('payment_transactions')
                .insert({
                  user_id: user.id,
                  tier_id: paymentData.tierId,
                  payment_method_id: paymentMethod.id,
                  amount: displayFinalUSD,
                  currency: 'USD',
                  billing_cycle: paymentData.billingCycle,
                  status: 'completed',
                  payment_type: 'one_time',
                  external_transaction_id: order.id,
                  selected_grade_id: paymentData.selectedGradeId,
                  selected_subject_ids: paymentData.selectedSubjectIds,
                  metadata: {
                    tier_name: paymentData.tierName,
                    paypal_order: order,
                    original_amount: displayAmountUSD,
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

              if (couponData) {
                await supabase.rpc('apply_coupon_code', {
                  p_coupon_code: couponData.code,
                  p_payment_transaction_id: transaction.id,
                  p_original_amount: displayAmountUSD,
                  p_currency: 'USD'
                });
              }

              sendReceiptEmailWithRetry(transaction.id).catch(() => {});
              setSucceeded(true);
              setTimeout(() => onSuccess(), 2000);
            } catch (err: any) {
              setError(err.message || 'Payment failed');
              setProcessing(false);
            }
          },

          onError: (err: any) => {
            console.error('PayPal error:', err);
            setError('Payment failed. Please try again.');
          },

          style: {
            layout: 'vertical',
            color: 'black',
            shape: 'rect',
            label: 'pay',
          },
        }).render('#paypal-button-container');
      }

      // Recurring subscription buttons
      if (paymentType === 'recurring' && paypalPlanId) {
        window.paypal.Buttons({
          createSubscription: async (data: any, actions: any) => {
            return actions.subscription.create({
              plan_id: paypalPlanId,
            });
          },

          onApprove: async (data: any, actions: any) => {
            setProcessing(true);
            try {
              if (!user) throw new Error('User not authenticated');

              const { data: transaction, error: transactionError } = await supabase
                .from('payment_transactions')
                .insert({
                  user_id: user.id,
                  tier_id: paymentData.tierId,
                  payment_method_id: paymentMethod.id,
                  amount: displayFinalUSD,
                  currency: 'USD',
                  billing_cycle: paymentData.billingCycle,
                  status: 'pending_activation',
                  payment_type: 'recurring',
                  external_transaction_id: data.subscriptionID,
                  paypal_subscription_id: data.subscriptionID,
                  paypal_plan_id: paypalPlanId,
                  selected_grade_id: paymentData.selectedGradeId,
                  selected_subject_ids: paymentData.selectedSubjectIds,
                  metadata: {
                    tier_name: paymentData.tierName,
                    subscription_data: data,
                    original_amount: displayAmountUSD,
                  }
                })
                .select()
                .single();

              if (transactionError) throw transactionError;

              // Subscription will be activated by webhook
              setSucceeded(true);
              setTimeout(() => onSuccess(), 2000);
            } catch (err: any) {
              setError(err.message || 'Subscription failed');
              setProcessing(false);
            }
          },

          onError: (err: any) => {
            console.error('PayPal subscription error:', err);
            setError('Subscription failed. Please try again.');
          },

          style: {
            layout: 'vertical',
            color: 'black',
            shape: 'rect',
            label: 'subscribe',
          },
        }).render('#paypal-button-container');
      }
    }
  }, [sdkReady, exchangeRate, paymentType, paypalPlanId, displayFinalUSD]);

  if (succeeded) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          {paymentType === 'recurring' ? 'Subscription Created!' : 'Payment Successful!'}
        </h2>
        <p className="text-gray-600">
          Your subscription has been {paymentType === 'recurring' ? 'activated' : 'processed'}. Redirecting...
        </p>
      </div>
    );
  }

  if (loadingRate) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">Loading payment information...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show payment type selection
  if (!paymentType) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          {!hideBackButton && (
            <button
              onClick={onBack}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
          )}
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose Payment Type</h2>
          <p className="text-gray-600">
            Select how you'd like to pay for your <strong>{paymentData.tierName}</strong> subscription
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* One-Time Payment Option */}
          <button
            onClick={() => setPaymentType('one_time')}
            className="border-2 border-gray-200 rounded-lg p-6 hover:border-blue-500 hover:shadow-lg transition-all text-left"
          >
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <CreditCard className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">One-Time Payment</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Pay manually each {paymentData.billingCycle === 'monthly' ? 'month' : 'year'}
                </p>
                <div className="text-2xl font-bold text-gray-900 mb-2">
                  ${displayAmountUSD}
                </div>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>✓ Full control over payments</li>
                  <li>✓ No automatic charges</li>
                  <li>✓ Renew when you want</li>
                </ul>
              </div>
            </div>
          </button>

          {/* Recurring Subscription Option */}
          <button
            onClick={() => setPaymentType('recurring')}
            className="border-2 border-blue-500 bg-blue-50 rounded-lg p-6 hover:shadow-lg transition-all text-left relative"
          >
            <div className="absolute top-3 right-3 bg-blue-500 text-white text-xs px-2 py-1 rounded-full font-semibold">
              RECOMMENDED
            </div>
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <Repeat className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Auto-Renewing Subscription</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Automatic renewal every {paymentData.billingCycle === 'monthly' ? 'month' : 'year'}
                </p>
                <div className="text-2xl font-bold text-gray-900 mb-2">
                  ${displayAmountUSD}/{paymentData.billingCycle === 'monthly' ? 'mo' : 'yr'}
                </div>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>✓ Never miss access</li>
                  <li>✓ Automatic renewals</li>
                  <li>✓ Cancel anytime</li>
                  <li>✓ Hassle-free</li>
                </ul>
              </div>
            </div>
          </button>
        </div>

        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">
            <strong>Both options give you the same access.</strong> The recurring subscription automatically renews
            so you never lose access. You can cancel anytime from your account settings.
          </p>
        </div>
      </div>
    );
  }

  // Show PayPal payment interface
  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => setPaymentType(null)}
          className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Change payment type</span>
        </button>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {paymentType === 'recurring' ? 'Subscribe with PayPal' : 'Pay with PayPal'}
        </h2>
        <p className="text-gray-600">
          {paymentType === 'recurring'
            ? `Auto-renewing subscription: $${displayAmountUSD} per ${paymentData.billingCycle === 'monthly' ? 'month' : 'year'}`
            : `One-time payment: $${displayAmountUSD}`
          }
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* PayPal Button Container */}
      <div className="mb-6">
        {!sdkReady || (paymentType === 'recurring' && loadingPlan) ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Loading PayPal...</p>
            </div>
          </div>
        ) : processing ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Processing {paymentType === 'recurring' ? 'subscription' : 'payment'}...</p>
            </div>
          </div>
        ) : (
          <div id="paypal-button-container"></div>
        )}
      </div>

      {/* Info Box */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>🔒 Secure:</strong> Your payment is processed securely through PayPal.
          {paymentType === 'recurring' && ' You can cancel your subscription anytime from your account settings.'}
        </p>
      </div>
    </div>
  );
}
