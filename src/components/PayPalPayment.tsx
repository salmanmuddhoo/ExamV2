import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { PaymentMethod, PaymentSelectionData } from '../types/payment';

// PayPal SDK types
declare global {
  interface Window {
    paypal?: any;
  }
}

interface PayPalPaymentProps {
  paymentData: PaymentSelectionData;
  paymentMethod: PaymentMethod;
  onBack: () => void;
  onSuccess: () => void;
}

export function PayPalPayment({
  paymentData,
  paymentMethod,
  onBack,
  onSuccess
}: PayPalPaymentProps) {
  const { user } = useAuth();
  const [sdkReady, setSdkReady] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [error, setError] = useState<string>('');

  // TODO: Replace with your PayPal client ID (sandbox mode)
  const PAYPAL_CLIENT_ID = 'YOUR_PAYPAL_CLIENT_ID';

  useEffect(() => {
    // Load PayPal SDK
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${PAYPAL_CLIENT_ID}&currency=USD`;
    script.addEventListener('load', () => setSdkReady(true));
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  useEffect(() => {
    if (sdkReady && window.paypal) {
      window.paypal
        .Buttons({
          createOrder: async (data: any, actions: any) => {
            return actions.order.create({
              purchase_units: [
                {
                  description: `${paymentData.tierName} - ${paymentData.billingCycle}`,
                  amount: {
                    currency_code: 'USD',
                    value: paymentData.amount.toFixed(2),
                  },
                },
              ],
            });
          },
          onApprove: async (data: any, actions: any) => {
            setProcessing(true);
            setError('');

            try {
              const order = await actions.order.capture();

              if (!user) throw new Error('User not authenticated');

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
                  status: 'completed',
                  external_transaction_id: order.id,
                  selected_grade_id: paymentData.selectedGradeId,
                  selected_subject_ids: paymentData.selectedSubjectIds,
                  metadata: {
                    tier_name: paymentData.tierName,
                    paypal_order: order
                  }
                })
                .select()
                .single();

              if (transactionError) throw transactionError;

              setSucceeded(true);
              setTimeout(() => onSuccess(), 2000);

            } catch (err: any) {
              console.error('PayPal payment error:', err);
              setError(err.message || 'Payment failed. Please try again.');
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
        })
        .render('#paypal-button-container');
    }
  }, [sdkReady, paymentData, paymentMethod, user, onSuccess]);

  if (succeeded) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
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
        <h2 className="text-2xl font-bold text-gray-900 mb-2">PayPal Payment</h2>
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

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* PayPal Button Container */}
      <div className="mb-6">
        {!sdkReady ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
          </div>
        ) : processing ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Processing payment...</p>
            </div>
          </div>
        ) : (
          <div id="paypal-button-container"></div>
        )}
      </div>

      {/* Security Info */}
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>🔒 Secure Payment:</strong> Your payment is processed securely through PayPal. We never access your PayPal credentials.
        </p>
      </div>

      {/* Test Mode Notice */}
      <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-800">
          <strong>⚠️ Sandbox Mode:</strong> You can use PayPal sandbox test accounts for testing. Personal: sb-buyer@personal.example.com | Business: sb-seller@business.example.com
        </p>
      </div>
    </div>
  );
}
