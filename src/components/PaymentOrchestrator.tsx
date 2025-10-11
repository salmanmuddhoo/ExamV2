import { useState } from 'react';
import { PaymentMethodSelector } from './PaymentMethodSelector';
import { StripePayment } from './StripePayment';
import { PayPalPayment } from './PayPalPayment';
import { MCBJuicePayment } from './MCBJuicePayment';
import type { PaymentMethod, PaymentSelectionData } from '../types/payment';

interface PaymentOrchestratorProps {
  paymentData: PaymentSelectionData;
  onBack: () => void;
  onSuccess: () => void;
}

type PaymentStep = 'select-method' | 'stripe' | 'paypal' | 'mcb_juice';

export function PaymentOrchestrator({
  paymentData,
  onBack,
  onSuccess
}: PaymentOrchestratorProps) {
  const [step, setStep] = useState<PaymentStep>('select-method');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);

  const handlePaymentMethodSelected = (method: PaymentMethod) => {
    setSelectedPaymentMethod(method);
    setStep(method.name as PaymentStep);
  };

  const handleBackToMethods = () => {
    setStep('select-method');
    setSelectedPaymentMethod(null);
  };

  if (step === 'select-method') {
    return (
      <PaymentMethodSelector
        paymentData={paymentData}
        onBack={onBack}
        onPaymentMethodSelected={handlePaymentMethodSelected}
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
      />
    );
  }

  return null;
}
