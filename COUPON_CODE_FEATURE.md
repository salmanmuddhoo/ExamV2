# Coupon Code Feature Documentation

## Overview

This document describes the coupon code discount system implemented for the ExamV2 platform. The system allows administrators to create and manage percentage-based discount coupons that students can apply at checkout across all payment providers.

## Features Implemented

### 1. Database Schema

**Tables Created:**

- **`coupon_codes`** - Stores all coupon codes with their configurations
  - `code` - Unique coupon code (case-insensitive, stored uppercase)
  - `discount_percentage` - Percentage discount (1-100%)
  - `valid_from` / `valid_until` - Validity date range
  - `is_active` - Active/inactive status
  - `max_uses` - Maximum number of uses (NULL = unlimited)
  - `current_uses` - Current usage count
  - `applicable_tiers` - Array of tier IDs (empty = all tiers)
  - `applicable_billing_cycles` - Array of cycles (empty = all cycles)

- **`coupon_usages`** - Tracks each coupon usage
  - Links to coupon, user, and payment transaction
  - Stores original, discount, and final amounts
  - Records currency used

- **`coupon_analytics`** (View) - Analytics for admin dashboard
  - Aggregates usage statistics per coupon
  - Calculates total discounts given
  - Shows unique users and total usages

**Database Functions:**

- **`validate_coupon_code()`** - Validates a coupon against all rules
  - Checks if code exists
  - Verifies active status
  - Validates date range
  - Checks usage limits
  - Verifies tier and billing cycle applicability

- **`apply_coupon_code()`** - Applies coupon to a payment transaction
  - Creates coupon usage record
  - Increments coupon usage count
  - Updates payment transaction with coupon metadata
  - Calculates and applies discount

## 2. Admin Dashboard

**Location:** Admin Dashboard → Coupon Codes Tab

**Features:**
- ✅ View all coupons with analytics (usage, unique users, total discounts)
- ✅ Create new coupons with comprehensive configuration
- ✅ Edit existing coupons
- ✅ Delete coupons
- ✅ Search and filter by status (active, inactive, expired, scheduled)
- ✅ Copy coupon codes to clipboard
- ✅ Real-time statistics dashboard

**Coupon Configuration Options:**
- Code (unique identifier)
- Description
- Discount percentage (1-100%)
- Validity period (start and end dates)
- Maximum uses (optional limit)
- Applicable subscription tiers (optional filter)
- Applicable billing cycles (monthly/yearly, optional filter)
- Active/inactive status

## 3. Checkout Integration

**Components Created/Updated:**

1. **`CouponInput.tsx`** - Reusable coupon input component
   - Input field for coupon code
   - Real-time validation
   - Discount calculation and display
   - Error handling with user-friendly messages

2. **`PaymentMethodSelector.tsx`** - Updated to include coupon input
   - Shows coupon input before payment method selection
   - Displays discounted prices on all payment methods
   - Passes coupon data to payment providers

3. **`PaymentOrchestrator.tsx`** - Updated to handle coupon flow
   - Manages coupon state across payment steps
   - Forwards coupon data to payment providers

4. **Payment Providers Updated:**
   - **`StripePayment.tsx`** - Full coupon support
   - **`PayPalPayment.tsx`** - Full coupon support
   - **`MCBJuicePayment.tsx`** - Full coupon support with MUR conversion

All payment providers:
- Accept and store coupon data
- Calculate final discounted amount
- Store coupon information in transaction metadata
- Call `apply_coupon_code()` after transaction creation
- Display original and discounted prices

## 4. Data Flow

### Coupon Application Flow:

```
1. Student enters coupon code in checkout
   ↓
2. CouponInput validates code via validate_coupon_code()
   ↓
3. If valid, calculates discount and shows final amount
   ↓
4. Student selects payment method (sees discounted price)
   ↓
5. Payment provider creates transaction with final amount
   ↓
6. Payment provider calls apply_coupon_code()
   ↓
7. Coupon usage recorded, usage count incremented
   ↓
8. Transaction metadata updated with coupon details
   ↓
9. Subscription created with correct pricing
```

### Validation Rules:

Coupons are validated against:
1. ✅ Code exists in database (case-insensitive)
2. ✅ Coupon is active
3. ✅ Current date is within valid date range
4. ✅ Usage limit not exceeded (if set)
5. ✅ Applies to selected subscription tier (if filter set)
6. ✅ Applies to selected billing cycle (if filter set)

## 5. Usage Tracking & Analytics

**Tracked Metrics:**
- Total number of times coupon used
- Unique users who used the coupon
- Total discount amount given
- Total original amount before discounts
- Total final amount after discounts
- Average discount per use

**Admin Analytics View:**
- Summary cards showing totals
- Per-coupon breakdown
- Real-time usage statistics
- Coupon status indicators

**Coupon Statuses:**
- **Active** - Currently valid and usable
- **Inactive** - Manually deactivated by admin
- **Expired** - Past the valid_until date
- **Scheduled** - Future start date
- **Maxed Out** - Reached maximum usage limit

## 6. Security & Data Integrity

**Row Level Security (RLS):**
- Only admins can create, update, or delete coupons
- Only admins can view all coupon analytics
- Users can view their own coupon usages
- Validation is server-side via database functions

**Data Integrity:**
- Coupon codes are unique (database constraint)
- Usage tracking is atomic (database triggers)
- All monetary calculations use DECIMAL type
- Amounts are validated before storage

## 7. Files Created/Modified

### New Files:
- `supabase/migrations/20251028000001_create_coupon_system.sql`
- `src/types/coupon.ts`
- `src/components/CouponCodeManager.tsx`
- `src/components/CouponInput.tsx`

### Modified Files:
- `src/components/AdminDashboard.tsx` - Added coupon tab
- `src/components/PaymentMethodSelector.tsx` - Added coupon input
- `src/components/PaymentOrchestrator.tsx` - Added coupon state management
- `src/components/StripePayment.tsx` - Added coupon support
- `src/components/PayPalPayment.tsx` - Added coupon support
- `src/components/MCBJuicePayment.tsx` - Added coupon support

## 8. Deployment Instructions

### Database Migration:

Run the migration to create all necessary tables and functions:

```bash
# The migration file is already created at:
# supabase/migrations/20251028000001_create_coupon_system.sql

# If using Supabase CLI:
supabase db push

# Or run the migration directly in Supabase dashboard SQL editor
```

### Post-Migration Setup:

1. **Create Test Coupon:**
   A sample coupon `WELCOME10` (10% off) is automatically created by the migration.

2. **Verify RLS Policies:**
   Ensure all RLS policies are active in Supabase dashboard.

3. **Test the Flow:**
   - Login as admin
   - Navigate to Admin Dashboard → Coupon Codes
   - Create a new coupon
   - Logout and test as a student
   - Apply coupon at checkout
   - Verify discount is applied correctly

## 9. Usage Examples

### Example 1: Create a Limited-Time Coupon

```javascript
// Admin creates via dashboard:
Code: BLACKFRIDAY2024
Discount: 25%
Valid From: 2024-11-25
Valid Until: 2024-11-30
Max Uses: 100
Applicable Tiers: All
Applicable Cycles: All
Status: Active
```

### Example 2: Student Package Only Coupon

```javascript
// Admin creates via dashboard:
Code: STUDENT50
Discount: 50%
Valid From: Now
Valid Until: +90 days
Max Uses: Unlimited
Applicable Tiers: [Student Tier ID only]
Applicable Cycles: [yearly]
Status: Active
```

### Example 3: First-Time Users Coupon

```javascript
// Admin creates via dashboard:
Code: WELCOME15
Discount: 15%
Valid From: Now
Valid Until: +365 days
Max Uses: Unlimited
Applicable Tiers: All
Applicable Cycles: All
Status: Active
```

## 10. Testing Checklist

- [ ] Run database migration successfully
- [ ] Admin can view Coupon Codes tab
- [ ] Admin can create new coupon
- [ ] Admin can edit existing coupon
- [ ] Admin can delete coupon
- [ ] Student can apply valid coupon at checkout
- [ ] Invalid coupon shows proper error message
- [ ] Expired coupon is rejected
- [ ] Maxed-out coupon is rejected
- [ ] Discount calculates correctly
- [ ] All payment providers (Stripe, PayPal, MCB Juice) work with coupons
- [ ] Coupon usage is tracked correctly
- [ ] Analytics show correct statistics
- [ ] Coupon cannot be used on wrong tier (if tier-specific)
- [ ] Coupon cannot be used on wrong billing cycle (if cycle-specific)

## 11. Future Enhancements (Optional)

Potential improvements that could be added:

1. **Fixed Amount Discounts** - In addition to percentage discounts
2. **One-Time Use Per User** - Limit coupon to once per user
3. **Referral Coupons** - Auto-generated codes for referrals
4. **Bulk Coupon Creation** - Generate multiple unique codes at once
5. **Coupon Expiry Notifications** - Email admins when coupons about to expire
6. **A/B Testing** - Create multiple variants of coupons
7. **Minimum Purchase Amount** - Require minimum tier for coupon
8. **Combination Rules** - Allow/disallow stacking coupons
9. **Auto-Apply Coupons** - Based on user segments or campaigns
10. **Export Coupon Reports** - CSV/Excel export of usage data

## 12. Troubleshooting

### Issue: Coupon validation fails with "Invalid coupon code"
**Solution:** Check that:
- The coupon code exists in the database
- The code is spelled correctly (case doesn't matter)
- The coupon status is "active"
- Current date is within valid range

### Issue: Applied coupon doesn't record usage
**Solution:** Check that:
- The `apply_coupon_code()` function completed successfully
- RLS policies allow coupon_usages INSERT
- payment_transaction_id is valid

### Issue: Analytics not showing correct numbers
**Solution:**
- Refresh the coupon analytics view
- Verify coupon_usages records exist
- Check that amounts are stored correctly

### Issue: Discount amount calculation is incorrect
**Solution:**
- Verify discount_percentage is set correctly
- Check that original amount is being passed properly
- Ensure DECIMAL precision is maintained

## 13. API Reference

### Database Functions

#### `validate_coupon_code(p_code, p_tier_id, p_billing_cycle, p_user_id)`

Validates a coupon code against all rules.

**Parameters:**
- `p_code` (TEXT) - The coupon code to validate
- `p_tier_id` (UUID) - The subscription tier ID
- `p_billing_cycle` (TEXT) - 'monthly' or 'yearly'
- `p_user_id` (UUID, optional) - User ID (defaults to auth.uid())

**Returns:**
```typescript
{
  is_valid: boolean;
  coupon_id: UUID | null;
  discount_percentage: number | null;
  error_message: string | null;
}
```

#### `apply_coupon_code(p_coupon_code, p_payment_transaction_id, p_original_amount, p_currency)`

Applies a coupon to a payment transaction.

**Parameters:**
- `p_coupon_code` (TEXT) - The coupon code
- `p_payment_transaction_id` (UUID) - Payment transaction ID
- `p_original_amount` (DECIMAL) - Original amount before discount
- `p_currency` (TEXT) - Currency code (default: 'USD')

**Returns:**
```typescript
{
  success: boolean;
  final_amount: number | null;
  discount_amount: number | null;
  error_message: string | null;
}
```

## 14. Support & Maintenance

**Monitoring:**
- Track coupon usage through the Analytics view
- Monitor for unusual patterns (e.g., abuse)
- Review expired coupons regularly

**Maintenance Tasks:**
- Deactivate expired coupons
- Remove old coupon usage records (optional, for performance)
- Update coupon descriptions and dates as needed
- Create new seasonal coupons

**Performance Considerations:**
- Indexes are created on commonly queried columns
- Coupon validation is optimized with single query
- Analytics view is cached by Supabase

---

## Summary

The coupon code system is fully integrated into the payment flow and provides administrators with complete control over discount campaigns. Students can easily apply coupons at checkout, and the system automatically validates, applies, and tracks all usage with comprehensive analytics.

For questions or issues, please contact the development team.
