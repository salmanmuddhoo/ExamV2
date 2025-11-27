-- Fix referral points trigger to fire on tier upgrades, not just status changes
-- Issue: When users upgrade from free to paid tier, status remains 'active'
-- so the trigger doesn't fire. We need to also check for tier_id changes.

CREATE OR REPLACE FUNCTION trigger_award_referral_points_on_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old_tier_name TEXT;
  v_new_tier_name TEXT;
BEGIN
  -- Only proceed if subscription is active
  IF NEW.status != 'active' THEN
    RETURN NEW;
  END IF;

  -- For INSERT: Award points if subscription is active
  IF TG_OP = 'INSERT' THEN
    PERFORM award_referral_points(NEW.id);
    RETURN NEW;
  END IF;

  -- For UPDATE: Award points if:
  -- 1. Status changed to active, OR
  -- 2. Tier changed from free to paid (upgrade scenario)
  IF TG_OP = 'UPDATE' THEN
    -- Check if status changed to active
    IF OLD.status != 'active' AND NEW.status = 'active' THEN
      PERFORM award_referral_points(NEW.id);
      RETURN NEW;
    END IF;

    -- Check if tier changed (upgrade from free to paid)
    IF OLD.tier_id != NEW.tier_id THEN
      -- Get tier names to check if this is an upgrade to paid tier
      SELECT name INTO v_old_tier_name
      FROM subscription_tiers
      WHERE id = OLD.tier_id;

      SELECT name INTO v_new_tier_name
      FROM subscription_tiers
      WHERE id = NEW.tier_id;

      -- If upgraded from free to paid tier, award points
      IF v_old_tier_name = 'free' AND v_new_tier_name != 'free' THEN
        PERFORM award_referral_points(NEW.id);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION trigger_award_referral_points_on_subscription IS
'Automatically awards referral points when:
1. A new active subscription is created
2. A subscription status changes to active
3. A subscription upgrades from free to paid tier (NEW FIX)';

-- Trigger already exists, but let's ensure it's properly configured
DROP TRIGGER IF EXISTS trigger_award_referral_points ON user_subscriptions;
CREATE TRIGGER trigger_award_referral_points
  AFTER INSERT OR UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_award_referral_points_on_subscription();
