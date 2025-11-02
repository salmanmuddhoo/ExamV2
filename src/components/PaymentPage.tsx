import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { PaymentOrchestrator } from './PaymentOrchestrator';
import type { PaymentSelectionData } from '../types/payment';

interface PaymentPageProps {
  onBack: () => void;
  onSuccess: () => void;
}

export function PaymentPage({ onBack, onSuccess }: PaymentPageProps) {
  const [paymentData, setPaymentData] = useState<PaymentSelectionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load payment data from sessionStorage
    const savedPaymentData = sessionStorage.getItem('subscription_paymentData');
    if (savedPaymentData) {
      try {
        const data = JSON.parse(savedPaymentData);
        setPaymentData(data);
      } catch (error) {
      }
    }
    setLoading(false);
  }, []);

  const handleSuccess = () => {
    // Clear payment data from sessionStorage
    sessionStorage.removeItem('subscription_paymentData');
    onSuccess();
  };

  const handleBack = () => {
    // Clear payment data from sessionStorage
    sessionStorage.removeItem('subscription_paymentData');
    onBack();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-black mb-4"></div>
          <p className="text-gray-600">Loading payment...</p>
        </div>
      </div>
    );
  }

  if (!paymentData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">No Payment Data Found</h2>
          <p className="text-gray-600 mb-6">
            It looks like there's no payment information available. Please go back and select a subscription plan.
          </p>
          <button
            onClick={handleBack}
            className="inline-flex items-center px-6 py-3 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Subscriptions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Complete Your Purchase</h1>
              <p className="text-sm text-gray-600 mt-1">
                {paymentData.tierName} - ${paymentData.amount}/{paymentData.billingCycle === 'monthly' ? 'month' : 'year'}
              </p>
            </div>
            <button
              onClick={handleBack}
              className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </button>
          </div>
        </div>
      </div>

      {/* Payment Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="bg-white rounded-lg shadow-sm p-6 sm:p-8">
          <PaymentOrchestrator
            paymentData={paymentData}
            onBack={handleBack}
            onSuccess={handleSuccess}
            hideBackButton={true}
          />
        </div>
      </div>
    </div>
  );
}
