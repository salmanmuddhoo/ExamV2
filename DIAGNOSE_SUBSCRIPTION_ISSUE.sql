-- ============================================================
-- DIAGNOSE SUBSCRIPTION DUPLICATE ISSUES
-- ============================================================
-- This script helps identify why the expiration function failed
-- and provides queries to fix any duplicate subscription issues
-- ============================================================

-- ============================================================
-- 1. CHECK FOR USERS WITH MULTIPLE ACTIVE SUBSCRIPTIONS
-- ============================================================
-- This should NOT happen due to unique constraint, but let's check

SELECT
  p.email,
  COUNT(*) as active_subscription_count,
  STRING_AGG(st.display_name, ', ') as tiers
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.status = 'active'
GROUP BY p.email
HAVING COUNT(*) > 1;

-- If this returns results, it means there are users with multiple active subscriptions
-- This violates the unique constraint and needs to be fixed


-- ============================================================
-- 2. CHECK FOR USERS WITH MULTIPLE EXPIRED YEARLY SUBSCRIPTIONS
-- ============================================================
-- This is the likely cause of the error

SELECT
  p.email,
  COUNT(*) as expired_yearly_count,
  ARRAY_AGG(us.id) as subscription_ids,
  ARRAY_AGG(st.display_name) as tiers,
  ARRAY_AGG(us.subscription_end_date) as end_dates
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.status = 'active'
  AND us.billing_cycle = 'yearly'
  AND us.subscription_end_date IS NOT NULL
  AND us.subscription_end_date < NOW()
GROUP BY p.email
HAVING COUNT(*) > 1;

-- If this returns results, these are users with multiple expired yearly subscriptions
-- The function will now handle this correctly with DISTINCT ON


-- ============================================================
-- 3. CHECK FOR USERS WITH BOTH ACTIVE AND EXPIRED SUBSCRIPTIONS
-- ============================================================

SELECT
  p.email,
  us.status,
  st.display_name as tier,
  us.billing_cycle,
  us.subscription_end_date,
  us.created_at
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE p.email IN (
  -- Find users who appear in multiple subscription records
  SELECT p2.email
  FROM user_subscriptions us2
  JOIN profiles p2 ON us2.user_id = p2.id
  GROUP BY p2.email
  HAVING COUNT(*) > 1
)
ORDER BY p.email, us.created_at DESC;


-- ============================================================
-- 4. VIEW ALL SUBSCRIPTIONS FOR A SPECIFIC USER
-- ============================================================
-- Replace 'test@example.com' with the user having issues

SELECT
  us.id,
  st.display_name as tier,
  us.status,
  us.billing_cycle,
  us.subscription_end_date,
  us.period_end_date,
  us.created_at,
  us.updated_at
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE p.email = 'test@example.com'  -- ⚠️ REPLACE WITH USER EMAIL
ORDER BY us.created_at DESC;


-- ============================================================
-- 5. FIX: CLEAN UP DUPLICATE ACTIVE SUBSCRIPTIONS
-- ============================================================
-- If a user has multiple active subscriptions, keep only the most recent one

-- First, identify which subscriptions to keep (most recent per user)
WITH ranked_subs AS (
  SELECT
    us.id,
    us.user_id,
    ROW_NUMBER() OVER (PARTITION BY us.user_id ORDER BY us.created_at DESC) as rn
  FROM user_subscriptions us
  WHERE us.status = 'active'
)
-- View subscriptions that would be marked as expired (all except the most recent)
SELECT
  p.email,
  st.display_name as tier,
  us.billing_cycle,
  us.created_at
FROM ranked_subs rs
JOIN user_subscriptions us ON rs.id = us.id
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE rs.rn > 1;  -- These are duplicates

-- If you want to actually fix it, uncomment this:
-- WITH ranked_subs AS (
--   SELECT
--     us.id,
--     us.user_id,
--     ROW_NUMBER() OVER (PARTITION BY us.user_id ORDER BY us.created_at DESC) as rn
--   FROM user_subscriptions us
--   WHERE us.status = 'active'
-- )
-- UPDATE user_subscriptions
-- SET status = 'expired', updated_at = NOW()
-- WHERE id IN (SELECT id FROM ranked_subs WHERE rn > 1);


-- ============================================================
-- 6. FIX: CLEAN UP DUPLICATE EXPIRED YEARLY SUBSCRIPTIONS
-- ============================================================
-- If a user has multiple expired yearly subscriptions, you can clean them up
-- This won't affect the function anymore (it now handles duplicates), but
-- it's good for data hygiene

-- View users with multiple expired yearly subscriptions
SELECT
  p.email,
  COUNT(*) as expired_count
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
WHERE us.status = 'active'  -- Still marked active but past subscription_end_date
  AND us.billing_cycle = 'yearly'
  AND us.subscription_end_date < NOW()
GROUP BY p.email
HAVING COUNT(*) > 1;


-- ============================================================
-- 7. RECOMMENDED: RUN THE FIXED FUNCTION
-- ============================================================
-- Now that the function is fixed to handle duplicates, run it:

-- First, apply the fix by running FIX_EXPIRE_YEARLY_SUBSCRIPTIONS.sql
-- Or run the migration: 20251027000001_fix_expire_yearly_subscriptions_duplicate_error.sql

-- Then run the function:
SELECT expire_yearly_subscriptions();

-- Check the result:
SELECT
  p.email,
  st.display_name as tier,
  us.status,
  us.billing_cycle,
  us.tokens_used_current_period,
  st.token_limit
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.status = 'active'
ORDER BY p.email;


-- ============================================================
-- 8. VERIFY NO DUPLICATE ACTIVE SUBSCRIPTIONS EXIST
-- ============================================================
-- After fixing, this should return 0 rows

SELECT
  p.email,
  COUNT(*) as active_count
FROM user_subscriptions us
JOIN profiles p ON us.user_id = p.id
WHERE us.status = 'active'
GROUP BY p.email
HAVING COUNT(*) > 1;

-- Expected: 0 rows (no duplicates)


-- ============================================================
-- SUMMARY OF THE FIX
-- ============================================================

/*
THE PROBLEM:
- The expire_yearly_subscriptions() function failed with error:
  "ON CONFLICT DO UPDATE command cannot affect row a second time"
- This happens when a user has multiple expired yearly subscriptions
- The function tried to insert a free tier subscription for each expired subscription
- Since user_id must be unique for active subscriptions, it tried to handle
  the same user_id multiple times in the same command

THE SOLUTION:
- Added DISTINCT ON (user_id) to the SELECT in the INSERT statement
- This ensures each user_id is only processed once, even if they have
  multiple expired yearly subscriptions
- The function now works correctly regardless of duplicate data

STEPS TO FIX:
1. Run the migration: 20251027000001_fix_expire_yearly_subscriptions_duplicate_error.sql
   OR
   Run the SQL in: FIX_EXPIRE_YEARLY_SUBSCRIPTIONS.sql

2. Run the function again:
   SELECT expire_yearly_subscriptions();

3. Verify users were downgraded correctly (queries above)

PREVENTION:
- The unique constraint prevents duplicate active subscriptions
- The fixed function handles duplicate expired subscriptions gracefully
- No further action needed
*/
