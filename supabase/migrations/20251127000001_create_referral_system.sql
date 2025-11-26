-- Create Referral System
-- Allows users to earn points by referring others who purchase subscriptions
-- Points can be redeemed to purchase subscription tiers

-- Add referral configuration to subscription_tiers
ALTER TABLE subscription_tiers
ADD COLUMN IF NOT EXISTS referral_points_awarded INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS points_cost INTEGER DEFAULT 0;

COMMENT ON COLUMN subscription_tiers.referral_points_awarded IS
'Points awarded to referrer when someone purchases this tier via referral';

COMMENT ON COLUMN subscription_tiers.points_cost IS
'Points required to purchase this tier using points redemption';

-- Create referral_codes table
-- Each user gets a unique referral code
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id ON referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);

COMMENT ON TABLE referral_codes IS 'Unique referral codes for each user';

-- Create referrals table
-- Tracks who referred whom
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  points_awarded INTEGER DEFAULT 0,
  subscription_tier_id UUID REFERENCES subscription_tiers(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(referred_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_id ON referrals(referred_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);

COMMENT ON TABLE referrals IS 'Tracks referral relationships between users';
COMMENT ON COLUMN referrals.status IS 'Status: pending (signed up but not purchased), completed (purchased), expired';
COMMENT ON COLUMN referrals.points_awarded IS 'Points awarded to referrer when referral purchased';

-- Create referral_transactions table
-- Tracks all point earnings and spending
CREATE TABLE IF NOT EXISTS referral_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL,
  points INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  referral_id UUID REFERENCES referrals(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES user_subscriptions(id) ON DELETE SET NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referral_transactions_user_id ON referral_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_transactions_created_at ON referral_transactions(created_at DESC);

COMMENT ON TABLE referral_transactions IS 'Transaction log for all referral points earned and spent';
COMMENT ON COLUMN referral_transactions.transaction_type IS 'Type: earned, spent, expired, bonus';

-- Create user_referral_points table
-- Stores current point balance for each user
CREATE TABLE IF NOT EXISTS user_referral_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  points_balance INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  total_referrals INTEGER NOT NULL DEFAULT 0,
  successful_referrals INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_referral_points_user_id ON user_referral_points(user_id);

COMMENT ON TABLE user_referral_points IS 'Current referral points balance and statistics for each user';

-- Function: Generate unique referral code
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_code TEXT;
  v_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate 8-character code: uppercase letters and numbers
    v_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));

    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM referral_codes WHERE code = v_code) INTO v_exists;

    EXIT WHEN NOT v_exists;
  END LOOP;

  RETURN v_code;
END;
$$;

-- Function: Create referral code for user
CREATE OR REPLACE FUNCTION create_referral_code_for_user(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_code TEXT;
BEGIN
  -- Check if user already has a code
  SELECT code INTO v_code FROM referral_codes WHERE user_id = p_user_id;

  IF v_code IS NOT NULL THEN
    RETURN v_code;
  END IF;

  -- Generate new code
  v_code := generate_referral_code();

  -- Insert code
  INSERT INTO referral_codes (user_id, code)
  VALUES (p_user_id, v_code)
  ON CONFLICT (user_id) DO NOTHING;

  -- Initialize points balance
  INSERT INTO user_referral_points (user_id, points_balance)
  VALUES (p_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN v_code;
END;
$$;

-- Function: Apply referral code (when new user signs up)
CREATE OR REPLACE FUNCTION apply_referral_code(p_referred_user_id UUID, p_referral_code TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_referrer_id UUID;
  v_referral_id UUID;
BEGIN
  -- Check if referral code exists
  SELECT user_id INTO v_referrer_id FROM referral_codes WHERE code = p_referral_code;

  IF v_referrer_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Can't refer yourself
  IF v_referrer_id = p_referred_user_id THEN
    RETURN FALSE;
  END IF;

  -- Check if user already has a referrer
  IF EXISTS(SELECT 1 FROM referrals WHERE referred_id = p_referred_user_id) THEN
    RETURN FALSE;
  END IF;

  -- Create referral record
  INSERT INTO referrals (referrer_id, referred_id, referral_code, status)
  VALUES (v_referrer_id, p_referred_user_id, p_referral_code, 'pending')
  RETURNING id INTO v_referral_id;

  -- Initialize points balance for referred user if not exists
  INSERT INTO user_referral_points (user_id, points_balance)
  VALUES (p_referred_user_id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Update referrer's total referrals count
  UPDATE user_referral_points
  SET total_referrals = total_referrals + 1,
      updated_at = NOW()
  WHERE user_id = v_referrer_id;

  RETURN TRUE;
END;
$$;

-- Function: Award referral points (when referred user purchases subscription)
CREATE OR REPLACE FUNCTION award_referral_points(p_subscription_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_subscription RECORD;
  v_referral RECORD;
  v_points INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Get subscription details
  SELECT us.user_id, us.tier_id, st.name as tier_name, st.referral_points_awarded
  INTO v_subscription
  FROM user_subscriptions us
  JOIN subscription_tiers st ON us.tier_id = st.id
  WHERE us.id = p_subscription_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Only award points for paid tiers (not free tier)
  IF v_subscription.tier_name = 'free' THEN
    RETURN;
  END IF;

  -- Check if this user was referred and points haven't been awarded yet
  SELECT * INTO v_referral
  FROM referrals
  WHERE referred_id = v_subscription.user_id
    AND status = 'pending';

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Get points to award
  v_points := COALESCE(v_subscription.referral_points_awarded, 0);

  IF v_points <= 0 THEN
    RETURN;
  END IF;

  -- Update referral status
  UPDATE referrals
  SET status = 'completed',
      points_awarded = v_points,
      subscription_tier_id = v_subscription.tier_id,
      completed_at = NOW()
  WHERE id = v_referral.id;

  -- Update referrer's points balance
  UPDATE user_referral_points
  SET points_balance = points_balance + v_points,
      total_earned = total_earned + v_points,
      successful_referrals = successful_referrals + 1,
      updated_at = NOW()
  WHERE user_id = v_referral.referrer_id
  RETURNING points_balance INTO v_new_balance;

  -- Record transaction
  INSERT INTO referral_transactions (
    user_id,
    transaction_type,
    points,
    balance_after,
    referral_id,
    subscription_id,
    description
  )
  VALUES (
    v_referral.referrer_id,
    'earned',
    v_points,
    v_new_balance,
    v_referral.id,
    p_subscription_id,
    format('Earned %s points from referral purchasing %s tier', v_points, v_subscription.tier_name)
  );
END;
$$;

-- Function: Redeem points for subscription
CREATE OR REPLACE FUNCTION redeem_points_for_subscription(
  p_user_id UUID,
  p_tier_id UUID,
  p_grade_id UUID DEFAULT NULL,
  p_subject_ids UUID[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier RECORD;
  v_points RECORD;
  v_new_balance INTEGER;
  v_subscription_id UUID;
BEGIN
  -- Get tier details
  SELECT id, name, points_cost, duration_months
  INTO v_tier
  FROM subscription_tiers
  WHERE id = p_tier_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tier not found';
  END IF;

  -- Check if tier can be purchased with points
  IF v_tier.points_cost IS NULL OR v_tier.points_cost <= 0 THEN
    RAISE EXCEPTION 'This tier cannot be purchased with points';
  END IF;

  -- Get user's points balance
  SELECT points_balance INTO v_points
  FROM user_referral_points
  WHERE user_id = p_user_id;

  IF NOT FOUND OR v_points.points_balance < v_tier.points_cost THEN
    RAISE EXCEPTION 'Insufficient points';
  END IF;

  -- Deduct points
  UPDATE user_referral_points
  SET points_balance = points_balance - v_tier.points_cost,
      total_spent = total_spent + v_tier.points_cost,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING points_balance INTO v_new_balance;

  -- Create or update subscription
  INSERT INTO user_subscriptions (
    user_id,
    tier_id,
    status,
    start_date,
    end_date,
    selected_grade_id,
    selected_subject_ids,
    payment_method
  )
  VALUES (
    p_user_id,
    p_tier_id,
    'active',
    NOW(),
    NOW() + (v_tier.duration_months || ' months')::INTERVAL,
    p_grade_id,
    p_subject_ids,
    'points'
  )
  ON CONFLICT (user_id)
  WHERE status = 'active'
  DO UPDATE SET
    tier_id = EXCLUDED.tier_id,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    selected_grade_id = COALESCE(EXCLUDED.selected_grade_id, user_subscriptions.selected_grade_id),
    selected_subject_ids = COALESCE(EXCLUDED.selected_subject_ids, user_subscriptions.selected_subject_ids),
    payment_method = EXCLUDED.payment_method,
    updated_at = NOW()
  RETURNING id INTO v_subscription_id;

  -- Record transaction
  INSERT INTO referral_transactions (
    user_id,
    transaction_type,
    points,
    balance_after,
    subscription_id,
    description
  )
  VALUES (
    p_user_id,
    'spent',
    -v_tier.points_cost,
    v_new_balance,
    v_subscription_id,
    format('Redeemed %s points for %s tier subscription', v_tier.points_cost, v_tier.name)
  );

  RETURN v_subscription_id;
END;
$$;

-- RLS Policies
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_referral_points ENABLE ROW LEVEL SECURITY;

-- Users can view their own referral code
CREATE POLICY "Users can view own referral code"
  ON referral_codes FOR SELECT
  USING (auth.uid() = user_id);

-- Users can view their own referrals
CREATE POLICY "Users can view own referrals"
  ON referrals FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

-- Users can view their own transactions
CREATE POLICY "Users can view own transactions"
  ON referral_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Users can view their own points balance
CREATE POLICY "Users can view own points"
  ON user_referral_points FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all
CREATE POLICY "Admins can view all referral codes"
  ON referral_codes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can view all referrals"
  ON referrals FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can view all transactions"
  ON referral_transactions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can view all points"
  ON user_referral_points FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Trigger: Auto-create referral code for new users
CREATE OR REPLACE FUNCTION auto_create_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM create_referral_code_for_user(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_auto_create_referral_code
  AFTER INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_referral_code();

-- Create referral codes for existing users
INSERT INTO referral_codes (user_id, code)
SELECT
  id,
  upper(substring(md5(random()::text || id::text) from 1 for 8))
FROM profiles
WHERE NOT EXISTS (
  SELECT 1 FROM referral_codes WHERE referral_codes.user_id = profiles.id
);

-- Initialize points balance for existing users
INSERT INTO user_referral_points (user_id, points_balance)
SELECT id, 0
FROM profiles
WHERE NOT EXISTS (
  SELECT 1 FROM user_referral_points WHERE user_referral_points.user_id = profiles.id
);

COMMENT ON FUNCTION award_referral_points IS 'Awards points to referrer when their referral purchases a paid subscription';
COMMENT ON FUNCTION redeem_points_for_subscription IS 'Allows users to redeem points for a subscription tier';
