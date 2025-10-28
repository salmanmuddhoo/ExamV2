// Coupon Code Types

export interface CouponCode {
  id: string;
  code: string;
  description: string | null;
  discount_percentage: number;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  max_uses: number | null;
  current_uses: number;
  applicable_tiers: string[];
  applicable_billing_cycles: ('monthly' | 'yearly')[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CouponUsage {
  id: string;
  coupon_id: string;
  user_id: string;
  payment_transaction_id: string | null;
  discount_amount: number;
  original_amount: number;
  final_amount: number;
  currency: string;
  created_at: string;
}

export interface CouponAnalytics {
  id: string;
  code: string;
  description: string | null;
  discount_percentage: number;
  valid_from: string;
  valid_until: string;
  is_active: boolean;
  max_uses: number | null;
  current_uses: number;
  created_at: string;
  total_usages: number;
  unique_users: number;
  total_discount_given: number;
  total_original_amount: number;
  total_final_amount: number;
  status: 'active' | 'inactive' | 'scheduled' | 'expired' | 'maxed_out';
}

export interface CouponValidationResult {
  is_valid: boolean;
  coupon_id: string | null;
  discount_percentage: number | null;
  error_message: string | null;
}

export interface CouponApplicationResult {
  success: boolean;
  final_amount: number | null;
  discount_amount: number | null;
  error_message: string | null;
}

export interface CreateCouponInput {
  code: string;
  description?: string;
  discount_percentage: number;
  valid_from: Date;
  valid_until: Date;
  is_active?: boolean;
  max_uses?: number | null;
  applicable_tiers?: string[];
  applicable_billing_cycles?: ('monthly' | 'yearly')[];
}

export interface UpdateCouponInput {
  description?: string;
  discount_percentage?: number;
  valid_from?: Date;
  valid_until?: Date;
  is_active?: boolean;
  max_uses?: number | null;
  applicable_tiers?: string[];
  applicable_billing_cycles?: ('monthly' | 'yearly')[];
}
