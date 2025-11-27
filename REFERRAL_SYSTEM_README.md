# Referral System Implementation Guide

## Overview

The referral system allows users to earn points by referring friends who purchase subscriptions. Points can then be redeemed to purchase subscription tiers.

## Database Schema

### New Tables

1. **referral_codes** - Unique referral codes for each user
2. **referrals** - Tracks who referred whom
3. **referral_transactions** - Transaction log for points earned/spent
4. **user_referral_points** - Current points balance for each user

### Updated Tables

**subscription_tiers** - Added columns:
- `referral_points_awarded` - Points given to referrer when someone buys this tier
- `points_cost` - Points needed to purchase this tier with points

## How It Works

### 1. User Gets Referral Code
- Every user automatically gets a unique referral code when they sign up
- Code is 8 characters (uppercase letters and numbers)
- Code is accessible via `referral_codes` table

### 2. Sharing Referral Links
- Users can share their referral link: `https://yoursite.com/signup?ref=ABCD1234`
- New users enter the referral code during signup

### 3. Earning Points
- When a referred user purchases a **paid subscription** (not free tier), the referrer earns points
- Points awarded = `subscription_tiers.referral_points_awarded` for that tier
- Trigger automatically awards points when subscription becomes active

### 4. Redeeming Points
- Users can redeem accumulated points to purchase subscription tiers
- Uses the `redeem_points_for_subscription` RPC function
- Deducts points and creates/updates subscription

## Integration Steps

### 1. Run Database Migrations

```bash
# The migrations are already in place:
# - 20251127000001_create_referral_system.sql
# - 20251127000002_set_default_referral_points.sql
# - 20251127000003_trigger_award_referral_points.sql

# Apply them via Supabase CLI or dashboard
```

### 2. Add Referral Dashboard to User Profile

In your user profile or navigation menu, add a link to the Referral Dashboard:

```tsx
import { ReferralDashboard } from './components/ReferralDashboard';

// In your routing:
<Route path="/referrals" element={<ReferralDashboard />} />
```

### 3. Add Referral Config to Admin Dashboard

In your admin dashboard, add the configuration manager:

```tsx
import { ReferralConfigManager } from './components/ReferralConfigManager';

// In admin routing:
<Route path="/admin/referrals" element={<ReferralConfigManager />} />
```

### 4. Handle Referral Code During Signup

Modify your signup flow to accept and store referral codes:

```tsx
// In signup component
const urlParams = new URLSearchParams(window.location.search);
const referralCode = urlParams.get('ref');

// After user signs up successfully:
if (referralCode && user) {
  await supabase.rpc('apply_referral_code', {
    p_referred_user_id: user.id,
    p_referral_code: referralCode
  });
}
```

### 5. Update Payment Method Handling

When creating subscriptions via payment, ensure the referral points trigger fires:

```tsx
// The trigger automatically awards points when subscription becomes active
// Just ensure subscriptions are created with status = 'active'

const { data: subscription } = await supabase
  .from('user_subscriptions')
  .insert({
    user_id: userId,
    tier_id: tierId,
    status: 'active', // This triggers point award
    // ... other fields
  });
```

## Default Point Configuration

The system comes with recommended default values:

| Tier          | Points Awarded | Points Cost |
|---------------|----------------|-------------|
| Free          | 0              | 0           |
| Student Lite  | 50             | 250         |
| Student       | 100            | 500         |
| Pro           | 200            | 1000        |

These can be adjusted by admins via the ReferralConfigManager UI.

## RPC Functions

### `create_referral_code_for_user(p_user_id UUID)`
Creates a referral code for a user (called automatically via trigger)

### `apply_referral_code(p_referred_user_id UUID, p_referral_code TEXT)`
Associates a new user with a referrer via referral code

### `award_referral_points(p_subscription_id UUID)`
Awards points to referrer (called automatically via trigger)

### `redeem_points_for_subscription(p_user_id UUID, p_tier_id UUID, p_grade_id UUID, p_subject_ids UUID[])`
Redeems points to purchase a subscription

## Security

- All tables have Row Level Security (RLS) enabled
- Users can only view their own referral data
- Admins can view all referral data
- Point transactions are immutable (logged in referral_transactions)

## Monitoring

### Check Referral Stats

```sql
-- Top referrers
SELECT
  p.email,
  urp.successful_referrals,
  urp.points_balance,
  urp.total_earned
FROM user_referral_points urp
JOIN profiles p ON urp.user_id = p.id
ORDER BY urp.successful_referrals DESC
LIMIT 10;

-- Recent referral activity
SELECT
  r.referral_code,
  ref.email as referrer_email,
  refd.email as referred_email,
  r.status,
  r.points_awarded,
  r.created_at
FROM referrals r
JOIN profiles ref ON r.referrer_id = ref.id
JOIN profiles refd ON r.referred_id = refd.id
ORDER BY r.created_at DESC
LIMIT 20;
```

## Testing

1. **Create Test Referral**:
   - Sign up as User A
   - Get referral code from `/referrals` page
   - Sign up as User B using referral link
   - Purchase a paid subscription as User B
   - Verify User A received points

2. **Test Points Redemption**:
   - Ensure User A has enough points
   - Go to `/referrals` page
   - Click "Redeem Points"
   - Select a tier
   - Verify subscription is created and points deducted

3. **Test Admin Configuration**:
   - Go to `/admin/referrals`
   - Modify point values
   - Verify changes are saved
   - Test that new referrals use updated values

## Troubleshooting

### Points Not Awarded
- Check that the referred user purchased a **paid** tier (not free)
- Verify subscription status is 'active'
- Check `referrals` table - status should be 'completed'
- Look at `referral_transactions` for the transaction record

### Can't Redeem Points
- Verify user has sufficient points
- Check that tier has `points_cost > 0`
- Ensure user_referral_points record exists

### Referral Code Not Working
- Verify referral code exists in `referral_codes` table
- Check that referred user doesn't already have a referrer
- Ensure referrer_id != referred_id (can't refer yourself)

## Future Enhancements

Potential additions to consider:
- Email notifications when points are earned
- Leaderboard of top referrers
- Bonus points for milestones (e.g., 5 referrals = bonus 100 points)
- Time-limited referral campaigns with multipliers
- Social media sharing integration
- Referral analytics dashboard
