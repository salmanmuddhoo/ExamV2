import { useState, useEffect } from 'react';
import { CreditCard, DollarSign, Smartphone, ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { PaymentMethod, PaymentSelectionData } from '../types/payment';

interface PaymentMethodSelectorProps {
  paymentData: PaymentSelectionData;
  onBack: () => void;
  onPaymentMethodSelected: (paymentMethod: PaymentMethod) => void;
}

export function PaymentMethodSelector({
  paymentData,
  onBack,
  onPaymentMethodSelected
}: PaymentMethodSelectorProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setPaymentMethods(data || []);
    } catch (error) {
      console.error('Error fetching payment methods:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPaymentIcon = (methodName: string) => {
    switch (methodName) {
      case 'stripe':
        return <CreditCard className="w-8 h-8" />;
      case 'paypal':
        return <DollarSign className="w-8 h-8" />;
      case 'mcb_juice':
        return <Smartphone className="w-8 h-8" />;
      default:
        return <CreditCard className="w-8 h-8" />;
    }
  };

  const getPaymentDescription = (methodName: string) => {
    switch (methodName) {
      case 'stripe':
        return 'Pay securely with credit or debit card';
      case 'paypal':
        return 'Pay with your PayPal account';
      case 'mcb_juice':
        return 'Pay via MCB Juice mobile money (Requires manual approval)';
      default:
        return '';
    }
  };

  const convertToMUR = (usdAmount: number) => {
    // Exchange rate USD to MUR (approximate, should be updated from API)
    const exchangeRate = 45.5;
    return Math.round(usdAmount * exchangeRate);
  };

  const getDisplayAmount = (method: PaymentMethod) => {
    if (method.currency === 'MUR') {
      const murAmount = convertToMUR(paymentData.amount);
      return `Rs ${murAmount.toLocaleString()}`;
    }
    return `$${paymentData.amount}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
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
          <span className="text-sm">Back to plans</span>
        </button>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose Payment Method</h2>
        <p className="text-gray-600">
          Complete your purchase for <strong>{paymentData.tierName}</strong> ({paymentData.billingCycle})
        </p>
      </div>

      {/* Payment Methods */}
      <div className="space-y-3">
        {paymentMethods.map((method) => (
          <button
            key={method.id}
            onClick={() => onPaymentMethodSelected(method)}
            className="w-full bg-white border-2 border-gray-200 hover:border-gray-900 rounded-xl p-6 transition-all group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-gray-100 rounded-lg group-hover:bg-gray-900 transition-colors">
                  <div className="text-gray-900 group-hover:text-white transition-colors">
                    {getPaymentIcon(method.name)}
                  </div>
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-semibold text-gray-900 mb-1">
                    {method.display_name}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {getPaymentDescription(method.name)}
                  </p>
                  {method.requires_manual_approval && (
                    <p className="text-xs text-orange-600 mt-1">
                      ⚠️ Requires admin approval (usually within 24 hours)
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-900">
                  {getDisplayAmount(method)}
                </p>
                <p className="text-xs text-gray-500">
                  {method.currency}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Info */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>💡 Secure Payment:</strong> All payments are processed securely. Your payment information is encrypted and never stored on our servers.
        </p>
      </div>
    </div>
  );
}
