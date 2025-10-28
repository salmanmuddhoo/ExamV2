import { useState, useEffect } from 'react';
import { CreditCard, DollarSign, Smartphone, ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { CouponInput } from './CouponInput';
import type { PaymentMethod, PaymentSelectionData } from '../types/payment';

interface PaymentMethodSelectorProps {
  paymentData: PaymentSelectionData;
  onBack: () => void;
  onPaymentMethodSelected: (paymentMethod: PaymentMethod, couponData?: {
    code: string;
    discountPercentage: number;
    discountAmount: number;
    finalAmount: number;
  }) => void;
  hideBackButton?: boolean;
}

export function PaymentMethodSelector({
  paymentData,
  onBack,
  onPaymentMethodSelected,
  hideBackButton = false
}: PaymentMethodSelectorProps) {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountPercentage: number;
    discountAmount: number;
    finalAmount: number;
  } | null>(null);

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
        return (
          <svg className="w-12 h-6" viewBox="0 0 60 25" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a8.33 8.33 0 0 1-4.56 1.1c-4.01 0-6.83-2.5-6.83-7.48 0-4.19 2.39-7.52 6.3-7.52 3.92 0 5.96 3.28 5.96 7.5 0 .4-.04 1.26-.06 1.48zm-5.92-5.62c-1.03 0-2.17.73-2.17 2.58h4.25c0-1.85-1.07-2.58-2.08-2.58zM40.95 20.3c-1.44 0-2.32-.6-2.9-1.04l-.02 4.63-4.12.87V5.57h3.76l.08 1.02a4.7 4.7 0 0 1 3.23-1.29c2.9 0 5.62 2.6 5.62 7.4 0 5.23-2.7 7.6-5.65 7.6zM40 8.95c-.95 0-1.54.34-1.97.81l.02 6.12c.4.44.98.78 1.95.78 1.52 0 2.54-1.65 2.54-3.87 0-2.15-1.04-3.84-2.54-3.84zM28.24 5.57h4.13v14.44h-4.13V5.57zm0-4.7L32.37 0v3.36l-4.13.88V.88zm-4.32 9.35v9.79H19.8V5.57h3.7l.12 1.22c1-1.77 3.07-1.41 3.62-1.22v3.79c-.52-.17-2.29-.43-3.32.86zm-8.55 4.72c0 2.43 2.6 1.68 3.12 1.46v3.36c-.55.3-1.54.54-2.89.54a4.15 4.15 0 0 1-4.27-4.24l.01-13.17 4.02-.86v3.54h3.14V9.1h-3.13v5.85zm-4.91.7c0 2.97-2.31 4.66-5.73 4.66a11.2 11.2 0 0 1-4.46-.93v-3.93c1.38.75 3.1 1.31 4.46 1.31.92 0 1.53-.24 1.53-1C6.26 13.77 0 14.51 0 9.95 0 7.04 2.28 5.3 5.62 5.3c1.36 0 2.72.2 4.09.75v3.88a9.23 9.23 0 0 0-4.1-1.06c-.86 0-1.44.25-1.44.9 0 1.85 6.29.97 6.29 5.88z" fill="currentColor"/>
          </svg>
        );
      case 'paypal':
        return (
          <svg className="w-12 h-6" viewBox="0 0 124 33" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M46.211 6.749h-6.839a.95.95 0 0 0-.939.802l-2.766 17.537a.57.57 0 0 0 .564.658h3.265a.95.95 0 0 0 .939-.803l.746-4.73a.95.95 0 0 1 .938-.803h2.165c4.505 0 7.105-2.18 7.784-6.5.306-1.89.013-3.375-.872-4.415-.972-1.142-2.696-1.746-4.985-1.746zm.789 6.405c-.374 2.454-2.249 2.454-4.062 2.454h-1.032l.724-4.583a.57.57 0 0 1 .563-.481h.473c1.235 0 2.4 0 3.002.704.359.42.468 1.044.332 1.906zM66.654 13.075h-3.275a.57.57 0 0 0-.563.481l-.145.916-.229-.332c-.709-1.029-2.29-1.373-3.868-1.373-3.619 0-6.71 2.741-7.312 6.586-.313 1.918.132 3.752 1.22 5.031.998 1.176 2.426 1.666 4.125 1.666 2.916 0 4.533-1.875 4.533-1.875l-.146.91a.57.57 0 0 0 .562.66h2.95a.95.95 0 0 0 .939-.803l1.77-11.209a.568.568 0 0 0-.561-.658zm-4.565 6.374c-.316 1.871-1.801 3.127-3.695 3.127-.951 0-1.711-.305-2.199-.883-.484-.574-.668-1.391-.514-2.301.295-1.855 1.805-3.152 3.67-3.152.93 0 1.686.309 2.184.892.499.589.697 1.411.554 2.317zM84.096 13.075h-3.291a.954.954 0 0 0-.787.417l-4.539 6.686-1.924-6.425a.953.953 0 0 0-.912-.678h-3.234a.57.57 0 0 0-.541.754l3.625 10.638-3.408 4.811a.57.57 0 0 0 .465.9h3.287a.949.949 0 0 0 .781-.408l10.946-15.8a.57.57 0 0 0-.468-.895z" fill="#253B80"/>
            <path d="M94.992 6.749h-6.84a.95.95 0 0 0-.938.802l-2.766 17.537a.569.569 0 0 0 .562.658h3.51a.665.665 0 0 0 .656-.562l.785-4.971a.95.95 0 0 1 .938-.803h2.164c4.506 0 7.105-2.18 7.785-6.5.307-1.89.012-3.375-.873-4.415-.971-1.142-2.694-1.746-4.983-1.746zm.789 6.405c-.373 2.454-2.248 2.454-4.062 2.454h-1.031l.725-4.583a.568.568 0 0 1 .562-.481h.473c1.234 0 2.4 0 3.002.704.359.42.468 1.044.331 1.906zM115.434 13.075h-3.273a.567.567 0 0 0-.562.481l-.145.916-.23-.332c-.709-1.029-2.289-1.373-3.867-1.373-3.619 0-6.709 2.741-7.311 6.586-.312 1.918.131 3.752 1.219 5.031 1 1.176 2.426 1.666 4.125 1.666 2.916 0 4.533-1.875 4.533-1.875l-.146.91a.57.57 0 0 0 .564.66h2.949a.95.95 0 0 0 .938-.803l1.771-11.209a.571.571 0 0 0-.565-.658zm-4.565 6.374c-.314 1.871-1.801 3.127-3.695 3.127-.949 0-1.711-.305-2.199-.883-.484-.574-.666-1.391-.514-2.301.297-1.855 1.805-3.152 3.67-3.152.93 0 1.686.309 2.184.892.501.589.699 1.411.554 2.317zM119.295 7.23l-2.807 17.858a.569.569 0 0 0 .562.658h2.822c.469 0 .867-.34.939-.803l2.768-17.536a.57.57 0 0 0-.562-.659h-3.16a.571.571 0 0 0-.562.482z" fill="#179BD7"/>
            <path d="M7.266 29.154l.523-3.322-1.165-.027H1.061L4.927 1.292a.316.316 0 0 1 .314-.268h9.38c3.114 0 5.263.648 6.385 1.927.526.6.861 1.227 1.023 1.917.17.724.173 1.589.007 2.644l-.012.077v.676l.526.298a3.69 3.69 0 0 1 1.065.812c.45.513.741 1.165.864 1.938.127.795.085 1.741-.123 2.812-.24 1.232-.628 2.305-1.152 3.183a6.547 6.547 0 0 1-1.825 2c-.696.494-1.523.869-2.458 1.109-.906.236-1.939.355-3.072.355h-.73c-.522 0-1.029.188-1.427.525a2.21 2.21 0 0 0-.744 1.328l-.055.299-.924 5.855-.042.215c-.011.068-.03.102-.058.125a.155.155 0 0 1-.096.035H7.266z" fill="#253B80"/>
            <path d="M23.048 7.667c-.028.179-.06.362-.096.55-1.237 6.351-5.469 8.545-10.874 8.545H9.326c-.661 0-1.218.48-1.321 1.132L6.596 26.83l-.399 2.533a.704.704 0 0 0 .695.814h4.881c.578 0 1.069-.42 1.16-.99l.048-.248.919-5.832.059-.32c.09-.572.582-.992 1.16-.992h.73c4.729 0 8.431-1.92 9.513-7.476.452-2.321.218-4.259-.978-5.622a4.667 4.667 0 0 0-1.336-1.03z" fill="#179BD7"/>
            <path d="M21.754 7.151a9.757 9.757 0 0 0-1.203-.267 15.284 15.284 0 0 0-2.426-.177h-7.352a1.172 1.172 0 0 0-1.159.992L8.05 17.605l-.045.289a1.336 1.336 0 0 1 1.321-1.132h2.752c5.405 0 9.637-2.195 10.874-8.545.037-.188.068-.371.096-.55a6.594 6.594 0 0 0-1.017-.429 9.045 9.045 0 0 0-.277-.087z" fill="#222D65"/>
            <path d="M9.614 7.699a1.169 1.169 0 0 1 1.159-.991h7.352c.871 0 1.684.057 2.426.177a9.757 9.757 0 0 1 1.481.353c.365.121.704.264 1.017.429.368-2.347-.003-3.945-1.272-5.392C20.378.682 17.853 0 14.622 0h-9.38c-.66 0-1.223.48-1.325 1.133L.01 25.898a.806.806 0 0 0 .795.932h5.791l1.454-9.225 1.564-9.906z" fill="#253B80"/>
          </svg>
        );
      case 'mcb_juice':
        return (
          <div className="flex items-center justify-center">
            <Smartphone className="w-6 h-6 text-orange-600" />
            <span className="ml-1 text-xs font-bold text-orange-600">MCB</span>
          </div>
        );
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
    const amount = appliedCoupon ? appliedCoupon.finalAmount : paymentData.amount;
    if (method.currency === 'MUR') {
      const murAmount = convertToMUR(amount);
      return `Rs ${murAmount.toLocaleString()}`;
    }
    return `$${amount}`;
  };

  const handleCouponApplied = (code: string, discountPercentage: number, discountAmount: number, finalAmount: number) => {
    setAppliedCoupon({
      code,
      discountPercentage,
      discountAmount,
      finalAmount
    });
  };

  const handleCouponRemoved = () => {
    setAppliedCoupon(null);
  };

  const handlePaymentMethodClick = (method: PaymentMethod) => {
    onPaymentMethodSelected(method, appliedCoupon || undefined);
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
        {!hideBackButton && (
          <button
            onClick={onBack}
            className="flex items-center space-x-1.5 text-gray-600 hover:text-gray-900 mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs sm:text-sm font-medium">Back to plans</span>
          </button>
        )}
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-1">Choose Payment Method</h2>
        <p className="text-xs sm:text-sm text-gray-600">
          Complete your purchase for <strong>{paymentData.tierName}</strong> ({paymentData.billingCycle})
        </p>
      </div>

      {/* Coupon Input */}
      <div className="mb-6">
        <CouponInput
          tierId={paymentData.tierId}
          billingCycle={paymentData.billingCycle}
          originalAmount={paymentData.amount}
          currency={paymentData.currency}
          onCouponApplied={handleCouponApplied}
          onCouponRemoved={handleCouponRemoved}
        />
      </div>

      {/* Payment Methods */}
      <div className="space-y-2.5 sm:space-y-3">
        {paymentMethods.map((method) => (
          <button
            key={method.id}
            onClick={() => handlePaymentMethodClick(method)}
            className="w-full bg-white border-2 border-gray-200 hover:border-gray-900 rounded-lg p-3 sm:p-4 transition-all group"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1">
                <div className="p-2 sm:p-3 bg-white border border-gray-200 rounded-lg group-hover:border-gray-400 transition-all flex-shrink-0 flex items-center justify-center min-w-[60px]">
                  <div className="text-gray-900">
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
