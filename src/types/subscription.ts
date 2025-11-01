export interface SubscriptionTier {
  id: string;
  name: 'free' | 'student' | 'pro';
  display_name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  token_limit: number | null; // null = unlimited
  papers_limit: number | null; // null = unlimited
  can_select_grade: boolean;
  can_select_subjects: boolean;
  max_subjects: number | null;
  is_active: boolean;
  coming_soon: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  tier_id: string;
  status: 'active' | 'cancelled' | 'expired' | 'suspended';
  billing_cycle: 'monthly' | 'yearly' | 'lifetime' | null;
  is_recurring: boolean;

  // Student package specific
  selected_grade_id: string | null;
  selected_subject_ids: string[];

  // Token tracking
  tokens_used_current_period: number;
  period_start_date: string;
  period_end_date: string | null;

  // Papers tracking
  papers_accessed_current_period: number;
  accessed_paper_ids: string[];

  // Payment details
  payment_provider: string | null;
  payment_id: string | null;
  amount_paid: number | null;
  currency: string;

  // Dates
  start_date: string;
  end_date: string | null;
  cancelled_at: string | null;
  subscription_end_date: string | null; // For yearly subscriptions - tracks when the year ends (period_end_date is used for monthly token resets)

  // Cancellation tracking
  cancel_at_period_end: boolean;
  cancellation_reason: string | null;
  cancellation_requested_at: string | null;

  created_at: string;
  updated_at: string;

  // Joined data
  subscription_tiers?: SubscriptionTier;
}

export interface SubscriptionConfig {
  id: string;
  key: string;
  value: string;
  description: string | null;
  value_type: 'string' | 'number' | 'boolean' | 'json';
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionAccessCheck {
  has_access: boolean;
  tier_name: string | null;
  reason: string;
  tokens_remaining: number;
  papers_remaining: number;
}
