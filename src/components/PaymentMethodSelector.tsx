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
        return <CreditCard className="w-6 h-6" />;
      case 'paypal':
        return <DollarSign className="w-6 h-6" />;
      case 'mcb_juice':
        return <Smartphone className="w-6 h-6" />;
      default:
        return <CreditCard className="w-6 h-6" />;
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
    <div className="max-w-3xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="mb-4">
        <button
          onClick={onBack}
          className="flex items-center space-x-1.5 text-gray-600 hover:text-gray-900 mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-xs sm:text-sm font-medium">Back to plans</span>
        </button>
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">Choose Payment Method</h2>
        <p className="text-xs sm:text-sm text-gray-600">
          Complete your purchase for <strong>{paymentData.tierName}</strong> ({paymentData.billingCycle})
        </p>
      </div>

      {/* Payment Methods */}
      <div className="space-y-2.5 sm:space-y-3">
        {paymentMethods.map((method) => (
          <button
            key={method.id}
            onClick={() => onPaymentMethodSelected(method)}
            className="w-full bg-white border-2 border-gray-200 hover:border-gray-900 rounded-lg p-3 sm:p-4 transition-all group"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
                <div className="p-1.5 sm:p-2 bg-gray-100 rounded-lg group-hover:bg-gray-900 transition-colors flex-shrink-0">
                  <div className="text-gray-900 group-hover:text-white transition-colors">
                    {getPaymentIcon(method.name)}
                  </div>
                </div>
                <div className="text-left min-w-0 flex-1">
                  <h3 className="text-sm sm:text-base font-semibold text-gray-900 mb-0.5 truncate">
                    {method.display_name}
                  </h3>
                  <p className="text-[10px] sm:text-xs text-gray-600 line-clamp-2">
                    {getPaymentDescription(method.name)}
                  </p>
                  {method.requires_manual_approval && (
                    <p className="text-[9px] sm:text-[10px] text-orange-600 mt-0.5">
                      ⚠️ Requires admin approval (usually within 24 hours)
                    </p>
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-base sm:text-xl font-bold text-gray-900 whitespace-nowrap">
                  {getDisplayAmount(method)}
                </p>
                <p className="text-[9px] sm:text-[10px] text-gray-500">
                  {method.currency}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Info */}
      <div className="mt-3 sm:mt-4 p-2.5 sm:p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-[10px] sm:text-xs text-blue-800">
          <strong>💡 Secure Payment:</strong> All payments are processed securely. Your payment information is encrypted and never stored on our servers.
        </p>
      </div>
    </div>
  );
}
