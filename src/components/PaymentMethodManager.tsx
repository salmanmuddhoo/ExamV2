import { useState, useEffect } from 'react';
import { CreditCard, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface PaymentMethod {
  id: string;
  name: string;
  display_name: string;
  is_active: boolean;
  requires_manual_approval: boolean;
  currency: string;
}

export function PaymentMethodManager() {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetchPaymentMethods();
  }, []);

  const fetchPaymentMethods = async () => {
    try {
      setLoading(true);
      // Admin needs to see all payment methods, not just active ones
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .order('name');

      if (error) throw error;
      setPaymentMethods(data || []);
    } catch (error) {
      alert('Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  };

  const togglePaymentMethod = async (methodId: string, currentStatus: boolean) => {
    try {
      setUpdating(methodId);
      const { error } = await supabase
        .from('payment_methods')
        .update({ is_active: !currentStatus })
        .eq('id', methodId);

      if (error) throw error;

      // Update local state
      setPaymentMethods(methods =>
        methods.map(method =>
          method.id === methodId
            ? { ...method, is_active: !currentStatus }
            : method
        )
      );
    } catch (error) {
      alert('Failed to update payment method status');
    } finally {
      setUpdating(null);
    }
  };

  const getPaymentIcon = (methodName: string) => {
    switch (methodName) {
      case 'stripe':
        return (
          <svg className="w-12 h-6" viewBox="0 0 60 25" fill="none">
            <path d="M59.64 14.28h-8.06c.19 1.93 1.6 2.55 3.2 2.55 1.64 0 2.96-.37 4.05-.95v3.32a8.33 8.33 0 01-4.56 1.1c-4.01 0-6.83-2.5-6.83-7.48 0-4.19 2.39-7.52 6.3-7.52 3.92 0 5.96 3.28 5.96 7.5 0 .4-.04 1.26-.06 1.48zm-5.92-5.62c-1.03 0-2.17.73-2.17 2.58h4.25c0-1.85-1.07-2.58-2.08-2.58zM40.95 20.3c-1.44 0-2.32-.6-2.9-1.04l-.02 4.63-4.12.87V5.57h3.76l.08 1.02a4.7 4.7 0 013.23-1.29c2.9 0 5.62 2.6 5.62 7.4 0 5.23-2.7 7.6-5.65 7.6zM40 8.95c-.95 0-1.54.34-1.97.81l.02 6.12c.4.44.98.78 1.95.78 1.52 0 2.54-1.65 2.54-3.87 0-2.15-1.04-3.84-2.54-3.84zM28.24 5.57h4.13v14.44h-4.13V5.57zm0-4.7L32.37 0v3.36l-4.13.88V.88zm-4.32 9.35v9.79H19.8V5.57h3.7l.12 1.22c1-1.77 3.07-1.41 3.62-1.22v3.79c-.52-.17-2.29-.43-3.32.86zm-8.55 4.72c0 2.43 2.6 1.68 3.12 1.46v3.36c-.55.3-1.54.54-2.89.54a4.15 4.15 0 01-4.27-4.24l.01-13.17 4.02-.86v3.54h3.14V9.1h-3.13v5.85zm-4.91.7c0 2.97-2.31 4.66-5.73 4.66a11.2 11.2 0 01-4.46-.93v-3.93c1.38.75 3.1 1.31 4.46 1.31.92 0 1.53-.24 1.53-1C6.26 13.77 0 14.51 0 9.95 0 7.04 2.28 5.3 5.62 5.3c1.36 0 2.72.2 4.09.75v3.88a9.23 9.23 0 00-4.1-1.06c-.86 0-1.44.25-1.44.9 0 1.85 6.29.97 6.29 5.88z" fill="#635BFF"/>
          </svg>
        );
      case 'paypal':
        return (
          <svg className="w-12 h-6" viewBox="0 0 124 33" fill="none">
            <path d="M46.211 6.749h-6.839a.95.95 0 0 0-.939.802l-2.766 17.537a.57.57 0 0 0 .564.658h3.265a.95.95 0 0 0 .939-.803l.746-4.73a.95.95 0 0 1 .938-.803h2.165c4.505 0 7.105-2.18 7.784-6.5.306-1.89.013-3.375-.872-4.415-.972-1.142-2.696-1.746-4.985-1.746zM47 13.154c-.374 2.454-2.249 2.454-4.062 2.454h-1.032l.724-4.583a.57.57 0 0 1 .563-.481h.473c1.235 0 2.4 0 3.002.704.359.42.469 1.044.332 1.906z" fill="#253B80"/>
            <path d="M66.654 13.075h-3.275a.57.57 0 0 0-.563.481l-.145.916-.229-.332c-.709-1.029-2.29-1.373-3.868-1.373-3.619 0-6.71 2.741-7.312 6.586-.313 1.918.132 3.752 1.22 5.031.998 1.176 2.426 1.666 4.125 1.666 2.916 0 4.533-1.875 4.533-1.875l-.146.91a.57.57 0 0 0 .562.66h2.95a.95.95 0 0 0 .939-.803l1.77-11.209a.568.568 0 0 0-.561-.658z" fill="#253B80"/>
            <path d="M94.992 6.749h-6.84a.95.95 0 0 0-.938.802l-2.766 17.537a.569.569 0 0 0 .562.658h3.51a.665.665 0 0 0 .656-.562l.785-4.971a.95.95 0 0 1 .938-.803h2.164c4.506 0 7.105-2.18 7.785-6.5.307-1.89.012-3.375-.873-4.415-.971-1.142-2.694-1.746-4.983-1.746z" fill="#179BD7"/>
            <path d="M115.434 13.075h-3.273a.567.567 0 0 0-.562.481l-.145.916-.23-.332c-.709-1.029-2.289-1.373-3.867-1.373-3.619 0-6.709 2.741-7.311 6.586-.312 1.918.131 3.752 1.219 5.031 1 1.176 2.426 1.666 4.125 1.666 2.916 0 4.533-1.875 4.533-1.875l-.146.91a.57.57 0 0 0 .564.66h2.949a.95.95 0 0 0 .938-.803l1.771-11.209a.571.571 0 0 0-.565-.658z" fill="#179BD7"/>
          </svg>
        );
      case 'mcb_juice':
        return (
          <div className="flex items-center space-x-1">
            <CreditCard className="w-5 h-5 text-red-600" />
            <span className="text-sm font-bold text-red-600">MCB</span>
          </div>
        );
      case 'peach':
        return (
          <svg className="w-12 h-8" viewBox="0 0 120 40" fill="none">
            <circle cx="20" cy="20" r="16" fill="#FF6B35"/>
            <circle cx="20" cy="20" r="12" fill="#FFE5D9" opacity="0.5"/>
            <text x="45" y="26" fill="#FF6B35" fontSize="20" fontWeight="bold" fontFamily="Arial">Peach</text>
          </svg>
        );
      default:
        return <CreditCard className="w-6 h-6 text-gray-400" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-2">Payment Method Settings</h2>
        <p className="text-xs sm:text-sm text-gray-600">
          Enable or disable payment methods available to users during checkout
        </p>
      </div>

      <div className="space-y-4">
        {paymentMethods.map((method) => (
          <div
            key={method.id}
            className={`border rounded-lg p-4 sm:p-6 transition-all ${
              method.is_active
                ? 'border-green-200 bg-green-50'
                : 'border-gray-200 bg-gray-50'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-start sm:items-center space-x-3 sm:space-x-4 flex-1 min-w-0">
                {/* Payment Icon */}
                <div className="flex-shrink-0 bg-white border border-gray-200 rounded-lg p-2 sm:p-3 flex items-center justify-center w-16 sm:min-w-[80px]">
                  {getPaymentIcon(method.name)}
                </div>

                {/* Payment Details */}
                <div className="flex-1 min-w-0">
                  <h3 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
                    {method.display_name}
                  </h3>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:space-x-3 mt-1 gap-1 sm:gap-0">
                    <span className="text-xs sm:text-sm text-gray-600">
                      Currency: <span className="font-medium">{method.currency}</span>
                    </span>
                    {method.requires_manual_approval && (
                      <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded inline-block w-fit">
                        Manual Approval Required
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status Toggle */}
              <div className="flex items-center justify-between sm:justify-end gap-3">
                <div className="flex items-center space-x-2">
                  {method.is_active ? (
                    <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5 text-green-600" />
                  ) : (
                    <XCircle className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                  )}
                  <span
                    className={`text-xs sm:text-sm font-medium ${
                      method.is_active ? 'text-green-600' : 'text-gray-500'
                    }`}
                  >
                    {method.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>

                <button
                  onClick={() => togglePaymentMethod(method.id, method.is_active)}
                  disabled={updating === method.id}
                  className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                    method.is_active
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-green-600 text-white hover:bg-green-700'
                  }`}
                >
                  {updating === method.id ? (
                    <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
                  ) : method.is_active ? (
                    'Deactivate'
                  ) : (
                    'Activate'
                  )}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Info Section */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="text-sm font-semibold text-blue-900 mb-2">How it works:</h4>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Only <strong>active</strong> payment methods will be visible to users during checkout</li>
          <li>• You can enable multiple payment methods simultaneously</li>
          <li>• Changes take effect immediately for all users</li>
          <li>• Existing transactions are not affected by status changes</li>
        </ul>
      </div>
    </div>
  );
}
