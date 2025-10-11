import { useState } from 'react';
import { ArrowLeft, Upload, Loader2, CheckCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { PaymentMethod, PaymentSelectionData } from '../types/payment';

interface MCBJuicePaymentProps {
  paymentData: PaymentSelectionData;
  paymentMethod: PaymentMethod;
  onBack: () => void;
  onSuccess: () => void;
}

export function MCBJuicePayment({
  paymentData,
  paymentMethod,
  onBack,
  onSuccess
}: MCBJuicePaymentProps) {
  const { user } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const exchangeRate = 45.5;
  const murAmount = Math.round(paymentData.amount * exchangeRate);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setProofFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user || !proofFile) return;

    setUploading(true);

    try {
      // Upload proof of payment
      const fileExt = proofFile.name.split('.').pop();
      const fileName = `${user.id}-${Date.now()}.${fileExt}`;
      const filePath = `payment-proofs/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('payment-proofs')
        .upload(filePath, proofFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('payment-proofs')
        .getPublicUrl(filePath);

      // Create payment transaction
      const { error: transactionError } = await supabase
        .from('payment_transactions')
        .insert({
          user_id: user.id,
          tier_id: paymentData.tierId,
          payment_method_id: paymentMethod.id,
          amount: murAmount,
          currency: 'MUR',
          billing_cycle: paymentData.billingCycle,
          status: 'pending',
          payment_proof_url: publicUrl,
          phone_number: phoneNumber,
          reference_number: referenceNumber,
          selected_grade_id: paymentData.selectedGradeId,
          selected_subject_ids: paymentData.selectedSubjectIds,
          metadata: {
            tier_name: paymentData.tierName,
            usd_amount: paymentData.amount,
            exchange_rate: exchangeRate
          }
        });

      if (transactionError) throw transactionError;

      setSubmitted(true);

      // Wait 2 seconds then call onSuccess
      setTimeout(() => {
        onSuccess();
      }, 2000);

    } catch (error: any) {
      console.error('Error submitting MCB Juice payment:', error);
      alert(`Failed to submit payment: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Payment Submitted!</h2>
        <p className="text-gray-600 mb-2">
          Your MCB Juice payment has been submitted for review.
        </p>
        <p className="text-sm text-gray-500">
          Our team will verify your payment within 24 hours. You'll receive an email once approved.
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
        <h2 className="text-2xl font-bold text-gray-900 mb-2">MCB Juice Payment</h2>
        <p className="text-gray-600">
          Complete payment for <strong>{paymentData.tierName}</strong> ({paymentData.billingCycle})
        </p>
      </div>

      {/* Payment Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
        <h3 className="font-semibold text-gray-900 mb-3">Payment Instructions:</h3>
        <ol className="space-y-2 text-sm text-gray-700">
          <li className="flex items-start">
            <span className="font-semibold mr-2">1.</span>
            <span>Open your MCB Juice app on your mobile phone</span>
          </li>
          <li className="flex items-start">
            <span className="font-semibold mr-2">2.</span>
            <span>Send <strong>Rs {murAmount.toLocaleString()}</strong> to merchant account</span>
          </li>
          <li className="flex items-start">
            <span className="font-semibold mr-2">3.</span>
            <span>Keep the transaction reference number</span>
          </li>
          <li className="flex items-start">
            <span className="font-semibold mr-2">4.</span>
            <span>Take a screenshot of the payment confirmation</span>
          </li>
          <li className="flex items-start">
            <span className="font-semibold mr-2">5.</span>
            <span>Fill in the form below and upload the screenshot</span>
          </li>
        </ol>
      </div>

      {/* Payment Amount */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
        <div className="flex items-center justify-between">
          <span className="text-gray-700 font-medium">Total Amount:</span>
          <div className="text-right">
            <p className="text-3xl font-bold text-gray-900">Rs {murAmount.toLocaleString()}</p>
            <p className="text-sm text-gray-500">Approx. ${paymentData.amount} USD</p>
          </div>
        </div>
      </div>

      {/* Payment Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Phone Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Phone Number Used for Payment *
          </label>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            required
            placeholder="e.g., 5XX XXXX"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-900"
          />
        </div>

        {/* Reference Number */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            MCB Juice Reference Number *
          </label>
          <input
            type="text"
            value={referenceNumber}
            onChange={(e) => setReferenceNumber(e.target.value)}
            required
            placeholder="Enter transaction reference number"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-900"
          />
        </div>

        {/* Proof Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Upload Payment Proof (Screenshot) *
          </label>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              required
              className="hidden"
              id="proof-upload"
            />
            <label
              htmlFor="proof-upload"
              className="cursor-pointer flex flex-col items-center"
            >
              <Upload className="w-12 h-12 text-gray-400 mb-2" />
              {proofFile ? (
                <p className="text-sm text-gray-900 font-medium">{proofFile.name}</p>
              ) : (
                <>
                  <p className="text-sm text-gray-600 mb-1">Click to upload payment screenshot</p>
                  <p className="text-xs text-gray-500">PNG, JPG up to 5MB</p>
                </>
              )}
            </label>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={uploading || !phoneNumber || !referenceNumber || !proofFile}
          className="w-full bg-gray-900 text-white py-3 rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          {uploading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Submitting...</span>
            </>
          ) : (
            <span>Submit for Approval</span>
          )}
        </button>
      </form>

      {/* Note */}
      <div className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
        <p className="text-sm text-orange-800">
          <strong>⚠️ Note:</strong> Your payment will be manually verified by our team. This usually takes up to 24 hours. You'll receive an email notification once your payment is approved and your subscription is activated.
        </p>
      </div>
    </div>
  );
}
