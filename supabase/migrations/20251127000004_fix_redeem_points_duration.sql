-- Fix redeem_points_for_subscription to use 1-month duration instead of non-existent duration_months column

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
  SELECT id, name, points_cost
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

  -- Create or update subscription (1 month duration for points redemption)
  INSERT INTO user_subscriptions (
    user_id,
    tier_id,
    status,
    billing_cycle,
    is_recurring,
    start_date,
    end_date,
    selected_grade_id,
    selected_subject_ids,
    payment_provider,
    period_start_date,
    period_end_date
  )
  VALUES (
    p_user_id,
    p_tier_id,
    'active',
    'monthly',
    FALSE, -- Not recurring for points redemption
    NOW(),
    NOW() + INTERVAL '1 month', -- Standard 1 month duration
    p_grade_id,
    p_subject_ids,
    'points', -- Track that this was purchased with points
    NOW(),
    NOW() + INTERVAL '1 month'
  )
  ON CONFLICT (user_id)
  WHERE status = 'active'
  DO UPDATE SET
    tier_id = EXCLUDED.tier_id,
    billing_cycle = EXCLUDED.billing_cycle,
    is_recurring = EXCLUDED.is_recurring,
    start_date = EXCLUDED.start_date,
    end_date = EXCLUDED.end_date,
    selected_grade_id = COALESCE(EXCLUDED.selected_grade_id, user_subscriptions.selected_grade_id),
    selected_subject_ids = COALESCE(EXCLUDED.selected_subject_ids, user_subscriptions.selected_subject_ids),
    payment_provider = EXCLUDED.payment_provider,
    period_start_date = EXCLUDED.period_start_date,
    period_end_date = EXCLUDED.period_end_date,
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
