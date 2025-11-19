import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Tag, Loader2, Check, X } from 'lucide-react';
import type { CouponValidationResult } from '../types/coupon';

interface CouponInputProps {
  tierId: string;
  billingCycle: 'monthly' | 'yearly';
  originalAmount: number;
  currency: string;
  onCouponApplied: (couponCode: string, discountPercentage: number, discountAmount: number, finalAmount: number) => void;
  onCouponRemoved: () => void;
}

export function CouponInput({
  tierId,
  billingCycle,
  originalAmount,
  currency,
  onCouponApplied,
  onCouponRemoved
}: CouponInputProps) {
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountPercentage: number;
    discountAmount: number;
    finalAmount: number;
  } | null>(null);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleValidateCoupon = async () => {
    if (!couponCode.trim()) {
      setError('Please enter a coupon code');
      return;
    }

    try {
      setValidating(true);
      setError(null);

      // Call the validation function
      const { data, error: rpcError } = await supabase.rpc('validate_coupon_code', {
        p_code: couponCode.trim(),
        p_tier_id: tierId,
        p_billing_cycle: billingCycle
      });

      if (rpcError) {
        setError('Failed to validate coupon code');
        return;
      }

      const validation = data as unknown as CouponValidationResult[];
      const result = validation[0];

      if (!result.is_valid) {
        setError(result.error_message || 'Invalid coupon code');
        return;
      }

      // Calculate discount
      const discountPercentage = result.discount_percentage!;
      const discountAmount = Math.round((originalAmount * discountPercentage / 100) * 100) / 100;
      const finalAmount = Math.max(0, originalAmount - discountAmount);

      // Apply coupon
      const couponData = {
        code: couponCode.trim().toUpperCase(),
        discountPercentage,
        discountAmount,
        finalAmount
      };

      setAppliedCoupon(couponData);
      onCouponApplied(
        couponData.code,
        couponData.discountPercentage,
        couponData.discountAmount,
        couponData.finalAmount
      );

      // Clear the input
      setCouponCode('');
    } catch (error: any) {
      setError('Failed to validate coupon code');
    } finally {
      setValidating(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setError(null);
    setCouponCode('');
    onCouponRemoved();
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleValidateCoupon();
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD'
    }).format(amount);
  };

  return (
    <div className="space-y-4">
      {/* Coupon Input */}
      {!appliedCoupon && (
        <div className="border border-gray-200 rounded-lg p-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Have a coupon code?
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 relative">
              <Tag className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={couponCode}
                onChange={(e) => {
                  setCouponCode(e.target.value.toUpperCase());
                  setError(null);
                }}
                onKeyPress={handleKeyPress}
                placeholder="Coupon code"
                disabled={validating}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono uppercase disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
              />
            </div>
            <button
              onClick={handleValidateCoupon}
              disabled={validating || !couponCode.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap text-sm"
            >
              {validating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span className="hidden sm:inline">Validating...</span>
                  <span className="sm:hidden">...</span>
                </>
              ) : (
                'Apply'
              )}
            </button>
          </div>
          {error && (
            <div className="mt-2 flex items-start gap-2 text-red-600 text-sm">
              <X size={16} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>
      )}

      {/* Applied Coupon Display */}
      {appliedCoupon && (
        <div className="border-2 border-green-200 bg-green-50 rounded-lg p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="bg-green-600 text-white rounded-full p-1">
                <Check size={16} />
              </div>
              <div>
                <p className="font-semibold text-green-900">Coupon Applied!</p>
                <p className="text-sm text-green-700">
                  Code: <span className="font-mono font-bold">{appliedCoupon.code}</span>
                </p>
              </div>
            </div>
            <button
              onClick={handleRemoveCoupon}
              className="text-green-700 hover:text-green-900 transition-colors"
              title="Remove coupon"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-2 border-t border-green-200 pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-green-700">Original Amount:</span>
              <span className="text-green-900 line-through">{formatCurrency(originalAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-green-700">Discount ({appliedCoupon.discountPercentage}%):</span>
              <span className="text-green-900 font-semibold">-{formatCurrency(appliedCoupon.discountAmount)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold border-t border-green-200 pt-2">
              <span className="text-green-900">Final Amount:</span>
              <span className="text-green-900">{formatCurrency(appliedCoupon.finalAmount)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
