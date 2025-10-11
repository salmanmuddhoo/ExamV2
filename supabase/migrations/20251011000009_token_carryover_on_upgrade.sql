-- Token carryover on upgrades
-- When upgrading from Student to Pro, tokens used should carry forward
-- This ensures users don't lose their usage history and can't game the system

-- Update the handle_successful_payment function to carry forward tokens on upgrades
CREATE OR REPLACE FUNCTION handle_successful_payment()
RETURNS TRIGGER AS $$
DECLARE
  v_payment_method RECORD;
  v_is_recurring BOOLEAN;
  v_old_subscription RECORD;
  v_is_upgrade BOOLEAN := FALSE;
  v_tokens_to_keep INTEGER := 0;
  v_papers_to_keep INTEGER := 0;
BEGIN
  -- Only proceed if status changed to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN

    -- Get payment method details to check if it requires manual approval (MCB Juice)
    SELECT * INTO v_payment_method
    FROM payment_methods
    WHERE id = NEW.payment_method_id;

    -- If payment method requires manual approval (MCB Juice), set is_recurring to FALSE
    -- Otherwise, set to TRUE for auto-renewing methods (Stripe, PayPal)
    IF v_payment_method.requires_manual_approval THEN
      v_is_recurring := FALSE;
    ELSE
      v_is_recurring := TRUE;
    END IF;

    -- Check if user has existing subscription (potential upgrade)
    SELECT * INTO v_old_subscription
    FROM user_subscriptions
    WHERE user_id = NEW.user_id AND status = 'active'
    LIMIT 1;

    -- Determine if this is an upgrade by comparing tier display_order
    IF v_old_subscription IS NOT NULL THEN
      SELECT
        new_tier.display_order > old_tier.display_order INTO v_is_upgrade
      FROM subscription_tiers old_tier, subscription_tiers new_tier
      WHERE old_tier.id = v_old_subscription.tier_id
        AND new_tier.id = NEW.tier_id;

      -- If upgrading, carry forward tokens and papers used
      IF v_is_upgrade THEN
        v_tokens_to_keep := v_old_subscription.tokens_used_current_period;
        v_papers_to_keep := v_old_subscription.papers_accessed_current_period;
      END IF;
    END IF;

    -- Update or create user subscription
    INSERT INTO user_subscriptions (
      user_id,
      tier_id,
      status,
      billing_cycle,
      is_recurring,
      payment_method_id,
      payment_provider,
      period_start_date,
      period_end_date,
      selected_grade_id,
      selected_subject_ids,
      tokens_used_current_period,
      papers_accessed_current_period
    )
    VALUES (
      NEW.user_id,
      NEW.tier_id,
      'active',
      NEW.billing_cycle,
      v_is_recurring,
      NEW.payment_method_id,
      v_payment_method.name,
      NOW(),
      CASE
        WHEN NEW.billing_cycle = 'monthly' THEN NOW() + INTERVAL '1 month'
        ELSE NOW() + INTERVAL '1 year'
      END,
      NEW.selected_grade_id,
      NEW.selected_subject_ids,
      v_tokens_to_keep,  -- Carry forward on upgrade, 0 on new subscription
      v_papers_to_keep   -- Carry forward on upgrade, 0 on new subscription
    )
    ON CONFLICT (user_id)
    DO UPDATE SET
      tier_id = EXCLUDED.tier_id,
      status = 'active',
      billing_cycle = EXCLUDED.billing_cycle,
      is_recurring = EXCLUDED.is_recurring,
      payment_method_id = EXCLUDED.payment_method_id,
      payment_provider = EXCLUDED.payment_provider,
      period_start_date = EXCLUDED.period_start_date,
      period_end_date = EXCLUDED.period_end_date,
      selected_grade_id = EXCLUDED.selected_grade_id,
      selected_subject_ids = EXCLUDED.selected_subject_ids,
      -- Carry forward tokens on upgrade, otherwise reset
      tokens_used_current_period = EXCLUDED.tokens_used_current_period,
      papers_accessed_current_period = EXCLUDED.papers_accessed_current_period,
      updated_at = NOW();

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment explaining the logic
COMMENT ON FUNCTION handle_successful_payment IS
  'Handles successful payment and activates subscription. On upgrades (higher display_order tier), tokens and papers used are carried forward to prevent gaming the system. On new subscriptions or renewals, usage is reset to 0.';
