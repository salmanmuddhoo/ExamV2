-- Create payment methods table
CREATE TABLE IF NOT EXISTS payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE, -- 'stripe', 'paypal', 'mcb_juice'
  display_name text NOT NULL,
  is_active boolean DEFAULT true,
  requires_manual_approval boolean DEFAULT false,
  currency text NOT NULL, -- 'USD', 'MUR'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create payment transactions table
CREATE TABLE IF NOT EXISTS payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier_id uuid NOT NULL REFERENCES subscription_tiers(id),
  payment_method_id uuid NOT NULL REFERENCES payment_methods(id),

  -- Payment details
  amount numeric(10, 2) NOT NULL,
  currency text NOT NULL,
  billing_cycle text NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),

  -- Status tracking
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'completed', 'failed', 'cancelled', 'refunded')),

  -- External payment provider details
  external_transaction_id text, -- Stripe/PayPal transaction ID
  payment_proof_url text, -- For MCB Juice - user uploads proof

  -- MCB Juice specific fields
  phone_number text, -- Phone number used for MCB Juice payment
  reference_number text, -- MCB Juice reference number

  -- Metadata
  metadata jsonb, -- Store additional payment data
  error_message text,

  -- Approval tracking (for MCB Juice)
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz,
  approval_notes text,

  -- Grade and subject selection (for student tier)
  selected_grade_id uuid REFERENCES grade_levels(id),
  selected_subject_ids uuid[], -- Array of subject IDs

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_payment_transactions_user_id ON payment_transactions(user_id);
CREATE INDEX idx_payment_transactions_status ON payment_transactions(status);
CREATE INDEX idx_payment_transactions_payment_method ON payment_transactions(payment_method_id);
CREATE INDEX idx_payment_transactions_created_at ON payment_transactions(created_at DESC);

-- Insert default payment methods
INSERT INTO payment_methods (name, display_name, requires_manual_approval, currency) VALUES
  ('stripe', 'Credit/Debit Card (Stripe)', false, 'USD'),
  ('paypal', 'PayPal', false, 'USD'),
  ('mcb_juice', 'MCB Juice', true, 'MUR')
ON CONFLICT (name) DO NOTHING;

-- Enable RLS
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_transactions ENABLE ROW LEVEL SECURITY;

-- Payment methods policies (public read)
CREATE POLICY "Anyone can view active payment methods"
  ON payment_methods FOR SELECT
  TO authenticated
  USING (is_active = true);

-- Payment transactions policies
CREATE POLICY "Users can view their own transactions"
  ON payment_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own transactions"
  ON payment_transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all transactions"
  ON payment_transactions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update transactions"
  ON payment_transactions FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Function to handle successful payment and activate subscription
CREATE OR REPLACE FUNCTION handle_successful_payment()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if status changed to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN

    -- Update or create user subscription
    INSERT INTO user_subscriptions (
      user_id,
      tier_id,
      status,
      billing_cycle,
      period_start_date,
      period_end_date,
      selected_grade_id,
      selected_subject_ids
    )
    VALUES (
      NEW.user_id,
      NEW.tier_id,
      'active',
      NEW.billing_cycle,
      NOW(),
      CASE
        WHEN NEW.billing_cycle = 'monthly' THEN NOW() + INTERVAL '1 month'
        ELSE NOW() + INTERVAL '1 year'
      END,
      NEW.selected_grade_id,
      NEW.selected_subject_ids
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      tier_id = EXCLUDED.tier_id,
      status = 'active',
      billing_cycle = EXCLUDED.billing_cycle,
      period_start_date = EXCLUDED.period_start_date,
      period_end_date = EXCLUDED.period_end_date,
      selected_grade_id = EXCLUDED.selected_grade_id,
      selected_subject_ids = EXCLUDED.selected_subject_ids,
      tokens_used_current_period = 0,
      papers_accessed_current_period = 0,
      updated_at = NOW();

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for successful payments
DROP TRIGGER IF EXISTS on_payment_completed ON payment_transactions;
CREATE TRIGGER on_payment_completed
  AFTER INSERT OR UPDATE ON payment_transactions
  FOR EACH ROW
  EXECUTE FUNCTION handle_successful_payment();

-- Create payment configuration table for storing API keys (encrypted)
CREATE TABLE IF NOT EXISTS payment_configuration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_method_name text NOT NULL UNIQUE,

  -- Store configuration as encrypted JSON
  config jsonb NOT NULL, -- Will store API keys, secrets, etc.

  -- Environment
  is_production boolean DEFAULT false,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE payment_configuration ENABLE ROW LEVEL SECURITY;

-- Only admins can access payment configuration
CREATE POLICY "Only admins can access payment configuration"
  ON payment_configuration FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create storage bucket for payment proofs
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for payment proofs
CREATE POLICY "Users can upload their own payment proof"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'payment-proofs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Payment proofs are publicly accessible"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'payment-proofs');

CREATE POLICY "Users can update their own payment proof"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'payment-proofs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Admins can access all payment proofs"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'payment-proofs' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
    AND profiles.role = 'admin'
  )
);
