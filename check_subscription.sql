-- Check the current subscription details
SELECT
  us.id as subscription_id,
  us.user_id,
  us.tier_id,
  st.name as tier_name,
  st.display_name,
  st.referral_points_awarded,
  us.status as subscription_status,
  us.created_at,
  us.updated_at
FROM user_subscriptions us
JOIN subscription_tiers st ON us.tier_id = st.id
WHERE us.id = '3c8532f4-0c6f-4d3c-aace-c40d75a6dcab';
