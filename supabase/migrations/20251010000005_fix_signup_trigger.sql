-- Drop the existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_auto_assign_free_tier ON profiles;

-- Drop and recreate the function with proper error handling
DROP FUNCTION IF EXISTS auto_assign_free_tier();

-- Function to auto-assign free tier to new users (with robust error handling)
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

        RAISE NOTICE 'Successfully assigned free tier to user %', NEW.id;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING 'Could not create free subscription for user %: %', NEW.id, SQLERRM;
          -- Don't fail the signup, just log the warning
      END;
    ELSE
      RAISE WARNING 'Free tier not found in subscription_tiers table';
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

-- Recreate trigger to auto-assign free tier on profile creation
CREATE TRIGGER trigger_auto_assign_free_tier
AFTER INSERT ON profiles
FOR EACH ROW
EXECUTE FUNCTION auto_assign_free_tier();
