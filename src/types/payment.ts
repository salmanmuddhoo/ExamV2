export interface PaymentMethod {
  id: string;
  name: 'stripe' | 'paypal' | 'mcb_juice';
  display_name: string;
  is_active: boolean;
  requires_manual_approval: boolean;
  currency: 'USD' | 'MUR';
  created_at: string;
  updated_at: string;
}

export interface PaymentTransaction {
  id: string;
  user_id: string;
  tier_id: string;
  payment_method_id: string;
  amount: number;
  currency: string;
  billing_cycle: 'daily' | 'monthly' | 'yearly';
  status: 'pending' | 'approved' | 'completed' | 'failed' | 'cancelled' | 'refunded';
  external_transaction_id?: string;
  payment_proof_url?: string;
  phone_number?: string;
  reference_number?: string;
  metadata?: any;
  error_message?: string;
  approved_by?: string;
  approved_at?: string;
  approval_notes?: string;
  selected_grade_id?: string;
  selected_subject_ids?: string[];
  created_at: string;
  updated_at: string;
}

export interface PaymentSelectionData {
  tierId: string;
  tierName: string;
  amount: number;
  currency: string;
  billingCycle: 'daily' | 'monthly' | 'yearly';
  selectedGradeId?: string;
  selectedSubjectIds?: string[];
}
