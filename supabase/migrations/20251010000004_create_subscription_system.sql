-- Enable uuid-ossp extension for uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create subscription tiers table
CREATE TABLE IF NOT EXISTS subscription_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  price_monthly DECIMAL(10, 2) NOT NULL DEFAULT 0,
  price_yearly DECIMAL(10, 2) NOT NULL DEFAULT 0,
  token_limit INTEGER, -- NULL means unlimited
  papers_limit INTEGER, -- NULL means unlimited, for Free tier this is 2
  can_select_grade BOOLEAN DEFAULT FALSE,
  can_select_subjects BOOLEAN DEFAULT FALSE,
  max_subjects INTEGER, -- NULL means unlimited or N/A
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on name for quick lookups
DO $$ BEGIN
    CREATE INDEX IF NOT EXISTS idx_subscription_tiers_name ON subscription_tiers(name);
EXCEPTION
    WHEN duplicate_table THEN null;
END $$;


-- Insert default tiers
INSERT INTO subscription_tiers (name, display_name, description, price_monthly, price_yearly, token_limit, papers_limit, can_select_grade, can_select_subjects, max_subjects, display_order) VALUES
('free', 'Free', 'Try our AI assistant with limited access', 0, 0, 50000, 2, FALSE, FALSE, NULL, 1),
('student', 'Student Package', 'Perfect for focused exam preparation', 15, 150, 500000, NULL, TRUE, TRUE, 3, 2),
('pro', 'Professional Package', 'Unlimited access to all features', 25, 250, NULL, NULL, FALSE, FALSE, NULL, 3);

-- Create user subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier_id UUID NOT NULL REFERENCES subscription_tiers(id) ON DELETE RESTRICT,

  -- Subscription details
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'suspended')),
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'yearly', 'lifetime')),
  is_recurring BOOLEAN DEFAULT TRUE,

  -- Student package specific fields
  selected_grade_id UUID REFERENCES grade_levels(id) ON DELETE SET NULL,
  selected_subject_ids UUID[] DEFAULT '{}', -- Array of subject IDs

  -- Token tracking for current period
  tokens_used_current_period INTEGER DEFAULT 0,
  period_start_date TIMESTAMPTZ DEFAULT NOW(),
  period_end_date TIMESTAMPTZ,

  -- Papers tracking (for free tier)
  papers_accessed_current_period INTEGER DEFAULT 0,
  accessed_paper_ids UUID[] DEFAULT '{}', -- Track which papers were accessed

  -- Payment details
  payment_provider TEXT, -- 'stripe', 'paypal', etc.
  payment_id TEXT,
  amount_paid DECIMAL(10, 2),
  currency TEXT DEFAULT 'USD',

  -- Dates
  start_date TIMESTAMPTZ DEFAULT NOW(),
  end_date TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX idx_user_subscriptions_tier_id ON user_subscriptions(tier_id);

-- Create partial unique index to ensure one active subscription per user
CREATE UNIQUE INDEX idx_user_subscriptions_active_unique
ON user_subscriptions(user_id)
WHERE status = 'active';

-- Create subscription config table (admin configurable settings)
CREATE TABLE IF NOT EXISTS subscription_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  description TEXT,
  value_type TEXT DEFAULT 'string' CHECK (value_type IN ('string', 'number', 'boolean', 'json')),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default config values
INSERT INTO subscription_config (key, value, description, value_type) VALUES
('free_tier_papers_limit', '2', 'Number of papers free users can access', 'number'),
('free_tier_token_limit', '50000', 'Token limit for free tier per month', 'number'),
('student_tier_token_limit', '500000', 'Token limit for student tier per month', 'number'),
('student_tier_max_subjects', '3', 'Maximum subjects for student tier', 'number'),
('trial_period_days', '0', 'Trial period in days (0 = no trial)', 'number'),
('auto_assign_free_tier', 'true', 'Automatically assign free tier to new users', 'boolean');

-- Function to auto-assign free tier to new users
CREATE OR REPLACE FUNCTION auto_assign_free_tier()
RETURNS TRIGGER AS $$
DECLARE
  free_tier_id UUID;
  auto_assign BOOLEAN;
BEGIN
  -- Check if auto-assign is enabled
  BEGIN
    SELECT value::boolean INTO auto_assign
    FROM subscription_config
    WHERE key = 'auto_assign_free_tier';
  EXCEPTION
    WHEN OTHERS THEN
      auto_assign := TRUE; -- Default to true if config doesn't exist yet
  END;

  IF auto_assign IS NULL OR auto_assign = TRUE THEN
    -- Get free tier ID
    BEGIN
      SELECT id INTO free_tier_id
      FROM subscription_tiers
      WHERE name = 'free' AND is_active = TRUE
      LIMIT 1;
    EXCEPTION
      WHEN OTHERS THEN
        RAISE WARNING 'Could not find free tier: %', SQLERRM;
        RETURN NEW;
    END;

    IF free_tier_id IS NOT NULL THEN
      -- Create free subscription for new user
      BEGIN
        INSERT INTO user_subscriptions (
          user_id,
          tier_id,
          status,
          billing_cycle,
          is_recurring,
          period_start_date,
          period_end_date
        ) VALUES (
          NEW.id,
          free_tier_id,
          'active',
          'monthly',
          FALSE,
          NOW(),
          NOW() + INTERVAL '30 days'
        );
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING 'Could not create free subscription for user %: %', NEW.id, SQLERRM;
          -- Don't fail the signup, just log the warning
      END;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- If anything goes wrong, don't fail the signup
    RAISE WARNING 'Error in auto_assign_free_tier: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-assign free tier on profile creation
CREATE TRIGGER trigger_auto_assign_free_tier
AFTER INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION auto_assign_free_tier();

-- Function to reset monthly token/paper limits
CREATE OR REPLACE FUNCTION reset_subscription_period()
RETURNS void AS $$
BEGIN
  UPDATE user_subscriptions
  SET
    tokens_used_current_period = 0,
    papers_accessed_current_period = 0,
    accessed_paper_ids = '{}',
    period_start_date = NOW(),
    period_end_date = CASE
      WHEN billing_cycle = 'monthly' THEN NOW() + INTERVAL '30 days'
      WHEN billing_cycle = 'yearly' THEN NOW() + INTERVAL '365 days'
      ELSE period_end_date
    END,
    updated_at = NOW()
  WHERE
    status = 'active'
    AND period_end_date < NOW()
    AND is_recurring = TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to check if user has access to a feature
CREATE OR REPLACE FUNCTION check_user_subscription_access(
  p_user_id UUID,
  p_feature TEXT DEFAULT 'chat' -- 'chat', 'paper_access'
)
RETURNS TABLE (
  has_access BOOLEAN,
  tier_name TEXT,
  reason TEXT,
  tokens_remaining INTEGER,
  papers_remaining INTEGER
) AS $$
DECLARE
  v_subscription RECORD;
  v_tier RECORD;
  v_tokens_remaining INTEGER;
  v_papers_remaining INTEGER;
BEGIN
  -- Get active subscription
  SELECT * INTO v_subscription
  FROM user_subscriptions
  WHERE user_id = p_user_id AND status = 'active'
  LIMIT 1;

  IF v_subscription IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::TEXT, 'No active subscription'::TEXT, 0, 0;
    RETURN;
  END IF;

  -- Get tier details
  SELECT * INTO v_tier
  FROM subscription_tiers
  WHERE id = v_subscription.tier_id;

  -- Calculate remaining tokens
  IF v_tier.token_limit IS NULL THEN
    v_tokens_remaining := -1; -- Unlimited
  ELSE
    v_tokens_remaining := v_tier.token_limit - v_subscription.tokens_used_current_period;
  END IF;

  -- Calculate remaining papers
  IF v_tier.papers_limit IS NULL THEN
    v_papers_remaining := -1; -- Unlimited
  ELSE
    v_papers_remaining := v_tier.papers_limit - v_subscription.papers_accessed_current_period;
  END IF;

  -- Check access based on feature
  IF p_feature = 'chat' THEN
    IF v_tokens_remaining = -1 OR v_tokens_remaining > 0 THEN
      RETURN QUERY SELECT TRUE, v_tier.name, 'Access granted'::TEXT, v_tokens_remaining, v_papers_remaining;
    ELSE
      RETURN QUERY SELECT FALSE, v_tier.name, 'Token limit exceeded'::TEXT, 0, v_papers_remaining;
    END IF;
  ELSIF p_feature = 'paper_access' THEN
    IF v_papers_remaining = -1 OR v_papers_remaining > 0 THEN
      RETURN QUERY SELECT TRUE, v_tier.name, 'Access granted'::TEXT, v_tokens_remaining, v_papers_remaining;
    ELSE
      RETURN QUERY SELECT FALSE, v_tier.name, 'Paper limit exceeded'::TEXT, v_tokens_remaining, 0;
    END IF;
  ELSE
    RETURN QUERY SELECT TRUE, v_tier.name, 'Access granted'::TEXT, v_tokens_remaining, v_papers_remaining;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS
ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies for subscription_tiers
CREATE POLICY "Anyone can view active tiers"
  ON subscription_tiers FOR SELECT
  USING (is_active = TRUE);

CREATE POLICY "Only admins can manage tiers"
  ON subscription_tiers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for user_subscriptions
CREATE POLICY "Users can view their own subscriptions"
  ON user_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all subscriptions"
  ON user_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Only admins can manage subscriptions"
  ON user_subscriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- RLS Policies for subscription_config
CREATE POLICY "Anyone can view config"
  ON subscription_config FOR SELECT
  USING (TRUE);

CREATE POLICY "Only admins can manage config"
  ON subscription_config FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Update function for updated_at timestamps
CREATE OR REPLACE FUNCTION update_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_subscription_tiers_updated_at
BEFORE UPDATE ON subscription_tiers
FOR EACH ROW
EXECUTE FUNCTION update_subscription_updated_at();

CREATE TRIGGER update_user_subscriptions_updated_at
BEFORE UPDATE ON user_subscriptions
FOR EACH ROW
EXECUTE FUNCTION update_subscription_updated_at();

CREATE TRIGGER update_subscription_config_updated_at
BEFORE UPDATE ON subscription_config
FOR EACH ROW
EXECUTE FUNCTION update_subscription_updated_at();
