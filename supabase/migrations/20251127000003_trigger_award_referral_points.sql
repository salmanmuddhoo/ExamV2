-- Trigger to automatically award referral points when subscription is created/updated

CREATE OR REPLACE FUNCTION trigger_award_referral_points_on_subscription()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only award points when:
  -- 1. Subscription is newly created (TG_OP = 'INSERT')
  -- 2. Subscription becomes active
  -- 3. It's a paid subscription (not free tier)
  IF (TG_OP = 'INSERT' AND NEW.status = 'active') OR
     (TG_OP = 'UPDATE' AND OLD.status != 'active' AND NEW.status = 'active') THEN

    -- Call the award function (it will check if points should be awarded)
    PERFORM award_referral_points(NEW.id);
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger on user_subscriptions
CREATE TRIGGER trigger_award_referral_points
  AFTER INSERT OR UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_award_referral_points_on_subscription();

COMMENT ON FUNCTION trigger_award_referral_points_on_subscription IS
'Automatically awards referral points when a referred user activates a paid subscription';
