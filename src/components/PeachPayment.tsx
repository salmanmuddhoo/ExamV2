import { useState } from 'react';
import { ArrowLeft, CreditCard, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { sendReceiptEmailWithRetry } from '../lib/receiptUtils';
import type { PaymentMethod, PaymentSelectionData } from '../types/payment';
import { getCurrencySymbol } from '../utils/currency';

interface CouponData {
  code: string;
  discountPercentage: number;
  discountAmount: number;
  finalAmount: number;
}

interface PeachPaymentProps {
  paymentData: PaymentSelectionData;
  paymentMethod: PaymentMethod;
  onBack: () => void;
  onSuccess: () => void;
  hideBackButton?: boolean;
  couponData?: CouponData;
}

export function PeachPayment({
  paymentData,
  paymentMethod,
  onBack,
  onSuccess,
  hideBackButton = false,
  couponData
}: PeachPaymentProps) {
  const { user } = useAuth();

  // Convert amount to USD if needed (Peach Payments uses USD)
  const convertToUSD = (amount: number, currency: string) => {
    if (currency === 'USD') return amount;
    if (currency === 'MUR') {
      // Exchange rate: 45.5 MUR = 1 USD
      return Number((amount / 45.5).toFixed(2));
    }
    return amount; // Default fallback
  };

  const displayAmountUSD = convertToUSD(paymentData.amount, paymentData.currency);
  const displayFinalUSD = couponData ? couponData.finalAmount : displayAmountUSD;

  const [processing, setProcessing] = useState(false);
  const [succeeded, setSucceeded] = useState(false);
  const [error, setError] = useState<string>('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length) {
      return parts.join(' ');
    } else {
      return value;
    }
  };

  const formatExpiryDate = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    if (v.length >= 2) {
      return v.slice(0, 2) + '/' + v.slice(2, 4);
    }
    return v;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user) {
      return;
    }

    setProcessing(true);
    setError('');

    let transactionId: string | null = null;

    try {
      // Validate card details
      if (!cardNumber || !cardHolder || !expiryDate || !cvv) {
        throw new Error('Please fill in all card details');
      }

      const cleanCardNumber = cardNumber.replace(/\s/g, '');
      if (cleanCardNumber.length < 13 || cleanCardNumber.length > 19) {
        throw new Error('Invalid card number');
      }

      if (expiryDate.length !== 5) {
        throw new Error('Invalid expiry date (MM/YY)');
      }

      if (cvv.length < 3 || cvv.length > 4) {
        throw new Error('Invalid CVV');
      }

      // Calculate final amount (use coupon final amount if present, otherwise original amount)
      const finalAmount = displayFinalUSD;
      const originalAmount = displayAmountUSD;

      // Create transaction in database
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

      // In production, you would integrate with Peach Payments API here
      // For now, simulate successful payment with test mode
      //
      // Example Peach Payments integration (you would need to implement this on your backend):
      // const response = await fetch('/api/peach/create-checkout', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     amount: finalAmount,
      //     currency: 'USD',
      //     card: {
      //       number: cleanCardNumber,
      //       holder: cardHolder,
      //       expiry_month: expiryDate.split('/')[0],
      //       expiry_year: '20' + expiryDate.split('/')[1],
      //       cvv: cvv
      //     }
      //   })
      // });

      // Simulate successful payment for test mode
      const testTransactionId = `peach_test_${Date.now()}`;

      const { error: updateError } = await supabase
        .from('payment_transactions')
        .update({
          status: 'completed',
          external_transaction_id: testTransactionId,
          metadata: {
            tier_name: paymentData.tierName,
            test_mode: true,
            peach_payment_id: testTransactionId,
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
        const { error: couponError } = await supabase.rpc('apply_coupon_code', {
          p_coupon_code: couponData.code,
          p_payment_transaction_id: transaction.id,
          p_original_amount: originalAmount,
          p_currency: 'USD'
        });

        if (couponError) {
          // Don't fail the payment, just log the error
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
          // Silent fail
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
      {/* Peach Payment Header Banner */}
      <div className="mb-6 bg-gradient-to-r from-orange-500 to-pink-500 rounded-lg p-6 text-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="bg-white rounded-lg p-2 flex items-center justify-center">
              <svg className="w-16 h-8" viewBox="0 0 120 40" fill="none">
                <circle cx="20" cy="20" r="16" fill="#FF6B35"/>
                <circle cx="20" cy="20" r="12" fill="#FFE5D9" opacity="0.5"/>
                <text x="45" y="26" fill="#FF6B35" fontSize="20" fontWeight="bold" fontFamily="Arial">Peach</text>
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-bold">Peach Payment</h3>
              <p className="text-sm text-orange-100">Secure card payments</p>
            </div>
          </div>
          {!hideBackButton && (
            <button
              onClick={onBack}
              className="flex items-center space-x-2 text-white hover:text-orange-100 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">Back</span>
            </button>
          )}
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-orange-100">
            {paymentData.tierName} - {paymentData.billingCycle}
          </span>
          <div className="text-right">
            {couponData ? (
              <>
                <span className="text-sm line-through text-orange-200 block">${displayAmountUSD}</span>
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
        {/* Card Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Card Number
          </label>
          <input
            type="text"
            value={cardNumber}
            onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
            placeholder="1234 5678 9012 3456"
            maxLength={19}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          />
        </div>

        {/* Card Holder */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Card Holder Name
          </label>
          <input
            type="text"
            value={cardHolder}
            onChange={(e) => setCardHolder(e.target.value.toUpperCase())}
            placeholder="JOHN DOE"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Expiry Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Expiry Date
            </label>
            <input
              type="text"
              value={expiryDate}
              onChange={(e) => setExpiryDate(formatExpiryDate(e.target.value))}
              placeholder="MM/YY"
              maxLength={5}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            />
          </div>

          {/* CVV */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              CVV
            </label>
            <input
              type="text"
              value={cvv}
              onChange={(e) => setCvv(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="123"
              maxLength={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
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
          disabled={processing}
          className="w-full bg-gradient-to-r from-orange-500 to-pink-500 text-white py-3 rounded-lg font-medium hover:from-orange-600 hover:to-pink-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
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
      <div className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
        <p className="text-sm text-orange-800">
          <strong>🔒 Secure Payment:</strong> Your payment is processed securely through Peach Payments. We never store your card details.
        </p>
      </div>

      {/* Test Mode Notice */}
      <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
        <p className="text-sm text-yellow-800 mb-2">
          <strong>⚠️ Test Mode:</strong> This is a simulated payment for testing purposes.
        </p>
        <p className="text-xs text-yellow-700">
          Use test card: <strong>5123 4567 8901 2346</strong> (any future date, any CVV)
        </p>
        <p className="text-xs text-yellow-700 mt-1">
          No real charges will be made. In production, this will integrate with Peach Payments API.
        </p>
      </div>
    </div>
  );
}
