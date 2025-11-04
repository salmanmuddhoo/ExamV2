import { useState } from 'react';
import { PaymentMethodSelector } from './PaymentMethodSelector';
import { StripePayment } from './StripePayment';
import { PayPalPayment } from './PayPalPayment';
import { MCBJuicePayment } from './MCBJuicePayment';
import { PeachPayment } from './PeachPayment';
import type { PaymentMethod, PaymentSelectionData } from '../types/payment';

interface PaymentOrchestratorProps {
  paymentData: PaymentSelectionData;
  onBack: () => void;
  onSuccess: () => void;
  hideBackButton?: boolean;
}

type PaymentStep = 'select-method' | 'stripe' | 'paypal' | 'mcb_juice' | 'peach';

interface CouponData {
  code: string;
  discountPercentage: number;
  discountAmount: number;
  finalAmount: number;
}

export function PaymentOrchestrator({
  paymentData,
  onBack,
  onSuccess,
  hideBackButton = false
}: PaymentOrchestratorProps) {
  const [step, setStep] = useState<PaymentStep>('select-method');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [couponData, setCouponData] = useState<CouponData | undefined>(undefined);

  const handlePaymentMethodSelected = (method: PaymentMethod, appliedCoupon?: CouponData) => {
    setSelectedPaymentMethod(method);
    setCouponData(appliedCoupon);
    setStep(method.name as PaymentStep);
  };

  const handleBackToMethods = () => {
    setStep('select-method');
    setSelectedPaymentMethod(null);
    // Keep coupon data when going back
  };

  if (step === 'select-method') {
    return (
      <PaymentMethodSelector
        paymentData={paymentData}
        onBack={onBack}
        onPaymentMethodSelected={handlePaymentMethodSelected}
        hideBackButton={hideBackButton}
      />
    );
  }

  if (step === 'stripe' && selectedPaymentMethod) {
    return (
      <StripePayment
        paymentData={paymentData}
        paymentMethod={selectedPaymentMethod}
        onBack={handleBackToMethods}
        onSuccess={onSuccess}
        hideBackButton={hideBackButton}
        couponData={couponData}
      />
    );
  }

  if (step === 'paypal' && selectedPaymentMethod) {
    return (
      <PayPalPayment
        paymentData={paymentData}
        paymentMethod={selectedPaymentMethod}
        onBack={handleBackToMethods}
        onSuccess={onSuccess}
        hideBackButton={hideBackButton}
        couponData={couponData}
      />
    );
  }

  if (step === 'mcb_juice' && selectedPaymentMethod) {
    return (
      <MCBJuicePayment
        paymentData={paymentData}
        paymentMethod={selectedPaymentMethod}
        onBack={handleBackToMethods}
        onSuccess={onSuccess}
        hideBackButton={hideBackButton}
        couponData={couponData}
      />
    );
  }

  if (step === 'peach' && selectedPaymentMethod) {
    return (
      <PeachPayment
        paymentData={paymentData}
        paymentMethod={selectedPaymentMethod}
        onBack={handleBackToMethods}
        onSuccess={onSuccess}
        hideBackButton={hideBackButton}
        couponData={couponData}
      />
    );
  }

  return null;
}
