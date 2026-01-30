import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, CheckCircle } from 'lucide-react';
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
  // Default to auto-renewal (checkbox checked)
  const [isRecurring, setIsRecurring] = useState(true);
  const [paypalPlanId, setPaypalPlanId] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [recurringAvailable, setRecurringAvailable] = useState<boolean | null>(null);

  // Derive payment type from checkbox
  const paymentType: PaymentType = isRecurring ? 'recurring' : 'one_time';

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

  // Check if recurring plan is available and fetch Plan ID
  useEffect(() => {
    const checkAndFetchPlan = async () => {
      setLoadingPlan(true);

      console.log('🔍 [PayPal Plan Check] Starting plan lookup...');
      console.log('   Tier ID:', paymentData.tierId);
      console.log('   Billing Cycle:', paymentData.billingCycle);
      console.log('   Tier Name:', paymentData.tierName);

      try {
        const { data, error } = await supabase
          .from('paypal_subscription_plans')
          .select('paypal_plan_id, tier_id, billing_cycle, is_active, price')
          .eq('tier_id', paymentData.tierId)
          .eq('billing_cycle', paymentData.billingCycle)
          .eq('is_active', true)
          .maybeSingle(); // Use maybeSingle to avoid 406 error when no rows found

        console.log('📊 [PayPal Plan Query Result]');
        console.log('   Error:', error);
        console.log('   Data:', data);

        if (!error && data) {
          console.log('✅ [PayPal Plan Found] Plan exists for daily billing');
          console.log('   Plan ID:', data.paypal_plan_id);
          console.log('   Setting recurringAvailable = true');
          console.log('   Keeping isRecurring = true (checkbox will be checked)');

          setPaypalPlanId(data.paypal_plan_id);
          setRecurringAvailable(true);
          // Keep isRecurring as true (default) when plan is available
        } else {
          console.log('❌ [PayPal Plan NOT Found] No matching plan');
          console.log('   Setting recurringAvailable = false');
          console.log('   Setting isRecurring = false (checkbox will be UNCHECKED)');
          if (error) {
            console.log('   Error details:', error.message, error.code);
          }

          setPaypalPlanId(null);
          setRecurringAvailable(false);
          // Set to one-time payment if no recurring plan available
          setIsRecurring(false);
        }
      } catch (err) {
        console.error('❌ [PayPal Plan Exception]', err);
        setPaypalPlanId(null);
        setRecurringAvailable(false);
        setIsRecurring(false);
      } finally {
        setLoadingPlan(false);
      }
    };
    checkAndFetchPlan();
  }, [paymentData.tierId, paymentData.billingCycle]);

  // Handle checkbox change
  const handleRecurringChange = (checked: boolean) => {
    if (checked && !recurringAvailable) {
      setError('Auto-renewal is not available for this subscription tier yet.');
      return;
    }
    setError('');
    setIsRecurring(checked);
  };

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

    console.log('[PayPal SDK] Starting to load PayPal SDK...');
    console.log('[PayPal SDK] User Agent:', navigator.userAgent);
    console.log('[PayPal SDK] Is PWA:', window.matchMedia('(display-mode: standalone)').matches);

    // Timeout to detect if SDK fails to load (important for PWA)
    const loadTimeout = setTimeout(() => {
      if (!sdkReady) {
        console.error('[PayPal SDK] Timeout: SDK failed to load after 30 seconds');
        setError('PayPal is taking too long to load. Please check your internet connection and try again.');
      }
    }, 30000); // 30 second timeout

    // Detect if running in PWA standalone mode
    const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                  window.matchMedia('(display-mode: fullscreen)').matches ||
                  (window.navigator as any).standalone === true;

    console.log('[PayPal SDK] PWA mode detected:', isPWA);

    const script = document.createElement('script');
    // Remove intent parameter to support both createOrder (one-time) and createSubscription (recurring)
    // vault=true enables subscription support without forcing it
    // Removed disable-funding=card to allow guest checkout with debit/credit cards
    // integration-date helps PayPal support PWA environments
    // components=buttons,funding-eligibility required for PWA
    let sdkUrl = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD&vault=true&components=buttons,funding-eligibility&integration-date=2024-01-01`;

    // In PWA mode, add data-page-type to help PayPal handle authentication better
    if (isPWA) {
      console.log('[PayPal SDK] Adding PWA-specific SDK parameters');
      script.setAttribute('data-page-type', 'checkout');
      script.setAttribute('data-sdk-integration-source', 'integrationbuilder_sc');
    }

    script.src = sdkUrl;

    // Set cross-origin attribute to help with PWA cookie handling
    script.setAttribute('crossorigin', 'anonymous');

    script.addEventListener('load', () => {
      console.log('[PayPal SDK] ✅ SDK loaded successfully');
      clearTimeout(loadTimeout);
      setSdkReady(true);
    });

    script.addEventListener('error', (e) => {
      console.error('[PayPal SDK] ❌ Failed to load:', e);
      clearTimeout(loadTimeout);
      setError('Failed to load PayPal. Please try again or contact support.');
    });

    document.body.appendChild(script);
    console.log('[PayPal SDK] Script tag added to body');

    return () => {
      clearTimeout(loadTimeout);
      if (document.body.contains(script)) {
        document.body.removeChild(script);
        console.log('[PayPal SDK] Script removed from body');
      }
    };
  }, [PAYPAL_CLIENT_ID]);

  // Render PayPal buttons
  useEffect(() => {
    console.log('[PayPal Buttons] Render check:', {
      sdkReady,
      hasPaypal: !!window.paypal,
      exchangeRate,
      isRecurring,
      paypalPlanId,
      paymentType
    });

    if (sdkReady && window.paypal && exchangeRate) {
      // Don't render until we have plan ID for recurring
      if (isRecurring && !paypalPlanId) {
        console.log('[PayPal Buttons] ⏳ Waiting for plan ID (recurring payment)');
        return;
      }

      console.log('[PayPal Buttons] ✅ All conditions met, rendering buttons...');

      const container = document.querySelector('#paypal-button-container');
      if (container) {
        container.innerHTML = '';
      }

      // Detect if running in PWA standalone mode
      const isPWA = window.matchMedia('(display-mode: standalone)').matches ||
                    window.matchMedia('(display-mode: fullscreen)').matches ||
                    (window.navigator as any).standalone === true;

      console.log('[PayPal Buttons] PWA mode detected:', isPWA);

      // One-time payment buttons
      if (!isRecurring) {
        window.paypal.Buttons({
          // Add onInit to ensure PayPal is ready before allowing clicks
          onInit: function(data: any, actions: any) {
            console.log('[PayPal] Button initialized, PWA mode:', isPWA);
            // Buttons are enabled by default
          },

          // Add onClick to handle PWA-specific logic
          onClick: function(data: any, actions: any) {
            console.log('[PayPal] Button clicked, PWA mode:', isPWA);

            // In PWA mode, warn user that PayPal will open in system browser
            if (isPWA) {
              const proceed = confirm(
                'PayPal login will open in your browser for security.\n\n' +
                'After completing payment, you\'ll be redirected back to the app.\n\n' +
                'Click OK to continue.'
              );

              if (!proceed) {
                return actions.reject();
              }
            }

            return actions.resolve();
          },

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
      if (isRecurring && paypalPlanId) {
        window.paypal.Buttons({
          // Add onInit for recurring subscriptions
          onInit: function(data: any, actions: any) {
            console.log('[PayPal Subscription] Button initialized, PWA mode:', isPWA);
          },

          // Add onClick for PWA handling in recurring subscriptions
          onClick: function(data: any, actions: any) {
            console.log('[PayPal Subscription] Button clicked, PWA mode:', isPWA);

            // In PWA mode, warn user that PayPal will open in system browser
            if (isPWA) {
              const proceed = confirm(
                'PayPal login will open in your browser for security.\n\n' +
                'After setting up your subscription, you\'ll be redirected back to the app.\n\n' +
                'Click OK to continue.'
              );

              if (!proceed) {
                return actions.reject();
              }
            }

            return actions.resolve();
          },

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
                  status: 'completed',
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

              // Subscription activated immediately (PayPal already approved)
              // Webhook will update metadata if needed
              sendReceiptEmailWithRetry(transaction.id).catch(() => {});
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
  }, [sdkReady, exchangeRate, isRecurring, paypalPlanId, displayFinalUSD]);

  if (succeeded) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          {isRecurring ? 'Subscription Created!' : 'Payment Successful!'}
        </h2>
        <p className="text-gray-600">
          Your subscription has been {isRecurring ? 'activated' : 'processed'}. Redirecting...
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

  // Show PayPal payment interface with recurring checkbox
  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
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
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Pay with PayPal</h2>
        <p className="text-gray-600">
          Complete your payment for <strong>{paymentData.tierName}</strong> - {
            paymentData.billingCycle === 'daily' ? 'Daily' :
            paymentData.billingCycle === 'monthly' ? 'Monthly' : 'Yearly'
          }
        </p>
      </div>

      {/* Amount Display */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex justify-between items-center">
          <span className="text-gray-700">Amount to pay:</span>
          <span className="text-2xl font-bold text-gray-900">
            ${displayFinalUSD.toFixed(2)}
            {couponData && (
              <span className="ml-2 text-sm text-green-600 font-normal">
                (Save ${couponData.discountAmount.toFixed(2)})
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Auto-Renewal Checkbox */}
      <div className="mb-4">
        <label className={`flex items-center space-x-2 p-3 border rounded-lg cursor-pointer transition-all ${
          isRecurring
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-200 hover:border-gray-300'
        } ${!recurringAvailable && recurringAvailable !== null ? 'opacity-60' : ''}`}>
          <input
            type="checkbox"
            checked={isRecurring}
            onChange={(e) => handleRecurringChange(e.target.checked)}
            disabled={!recurringAvailable && recurringAvailable !== null}
            className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
          />
          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <span className="text-sm font-medium text-gray-900">Enable auto-renewal</span>
              {recurringAvailable && (
                <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Recommended</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {recurringAvailable
                ? `Automatically renew your subscription every ${
                    paymentData.billingCycle === 'daily' ? 'day' :
                    paymentData.billingCycle === 'monthly' ? 'month' : 'year'
                  }. Cancel anytime.`
                : `Auto-renewal is not configured for this tier yet. ${
                    paymentData.billingCycle === 'daily' ? 'Daily recurring plans must be set up in PayPal first.' : ''
                  }`
              }
            </p>
          </div>
        </label>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* PayPal Button Container */}
      <div className="mb-6">
        {!sdkReady || (isRecurring && loadingPlan) ? (
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
              <p className="text-gray-600">Processing {isRecurring ? 'subscription' : 'payment'}...</p>
            </div>
          </div>
        ) : (
          <div id="paypal-button-container"></div>
        )}
      </div>

      {/* Info Box */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>Secure:</strong> Your payment is processed securely through PayPal.
          {isRecurring && ' You can cancel your subscription anytime from your account settings.'}
        </p>
      </div>

      {/* PWA Help Message */}
      {(window.matchMedia('(display-mode: standalone)').matches ||
        window.matchMedia('(display-mode: fullscreen)').matches ||
        (window.navigator as any).standalone === true) && (
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>Using the app?</strong> If PayPal login doesn't work, try making the payment on the website at{' '}
            <a href="https://aixampapers.com" target="_blank" rel="noopener noreferrer" className="underline font-medium">
              aixampapers.com
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
