# Coming Soon Feature - Implementation Guide

## Overview
This feature allows admins to mark subscription packages as "Coming Soon", which displays them on the pricing page but prevents users from purchasing them.

## Database Changes

A new migration has been added: `20251101000001_add_coming_soon_to_subscription_tiers.sql`

### What Changed:
1. **New Column**: `coming_soon` (BOOLEAN, default: FALSE) added to `subscription_tiers` table
2. **Helper Function**: `is_tier_purchasable(tier_id UUID)` - Returns true if a tier can be purchased
3. **Index**: Performance index for filtering available packages

## Admin Panel Implementation

### Update Admin Subscription Management Form

Add a checkbox to the subscription tier form:

```typescript
// In your admin subscription tier form component
interface SubscriptionTierFormData {
  // ... existing fields
  coming_soon: boolean;
}

// Example form field (React/Next.js)
<div className="flex items-center space-x-2">
  <input
    type="checkbox"
    id="coming_soon"
    name="coming_soon"
    checked={formData.coming_soon}
    onChange={(e) => setFormData({
      ...formData,
      coming_soon: e.target.checked
    })}
  />
  <label htmlFor="coming_soon">
    Mark as "Coming Soon" (users cannot purchase)
  </label>
</div>
```

### Database Query to Update Tier

```typescript
// Update a subscription tier with coming_soon status
const { error } = await supabase
  .from('subscription_tiers')
  .update({
    coming_soon: comingSoonValue,
    updated_at: new Date().toISOString()
  })
  .eq('id', tierId);
```

## Frontend Pricing Page Implementation

### 1. Fetch Subscription Tiers with coming_soon field

```typescript
const { data: tiers, error } = await supabase
  .from('subscription_tiers')
  .select('*')
  .eq('is_active', true)
  .order('display_order');

// Tiers will now include the coming_soon field
```

### 2. Conditional Button Rendering

```typescript
// Example React component
function SubscriptionCard({ tier }) {
  const isComingSoon = tier.coming_soon;

  return (
    <div className="subscription-card">
      <h3>{tier.display_name}</h3>
      <p>{tier.description}</p>
      <p className="price">${tier.price_monthly}/month</p>

      {/* Coming Soon Badge */}
      {isComingSoon && (
        <div className="coming-soon-badge">
          Coming Soon
        </div>
      )}

      {/* Purchase Button */}
      <button
        disabled={isComingSoon}
        className={isComingSoon ? 'btn-disabled' : 'btn-primary'}
        onClick={() => handlePurchase(tier.id)}
      >
        {isComingSoon ? 'Coming Soon' : 'Subscribe Now'}
      </button>
    </div>
  );
}
```

### 3. Styling Examples

```css
/* Disabled button for coming soon packages */
.btn-disabled {
  background-color: #6b7280;
  color: #d1d5db;
  cursor: not-allowed;
  opacity: 0.6;
}

.btn-disabled:hover {
  background-color: #6b7280; /* No hover effect */
}

/* Coming soon badge */
.coming-soon-badge {
  background-color: #fef3c7;
  color: #92400e;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  display: inline-block;
  margin-bottom: 8px;
}
```

### 4. Using the Helper Function

You can also use the database helper function to check purchasability:

```typescript
const { data, error } = await supabase
  .rpc('is_tier_purchasable', { tier_id: tierId });

// data will be true or false
if (data) {
  // Allow purchase
} else {
  // Show "Coming Soon" or error message
}
```

## Backend/Payment Processing

Ensure payment endpoints validate that a tier is purchasable before processing:

```typescript
// In your payment API endpoint
const { data: isPurchasable } = await supabase
  .rpc('is_tier_purchasable', { tier_id: requestedTierId });

if (!isPurchasable) {
  return res.status(400).json({
    error: 'This subscription tier is not available for purchase'
  });
}

// Proceed with payment processing...
```

## Example States

### Available Package
```json
{
  "id": "uuid",
  "name": "pro",
  "display_name": "Professional Package",
  "is_active": true,
  "coming_soon": false
}
```
**Result**: Shows "Subscribe Now" button (enabled)

### Coming Soon Package
```json
{
  "id": "uuid",
  "name": "enterprise",
  "display_name": "Enterprise Package",
  "is_active": true,
  "coming_soon": true
}
```
**Result**: Shows "Coming Soon" button (disabled)

### Inactive Package
```json
{
  "id": "uuid",
  "name": "deprecated",
  "display_name": "Old Package",
  "is_active": false,
  "coming_soon": false
}
```
**Result**: Not shown on pricing page at all

## Testing Checklist

- [ ] Admin can check/uncheck "Coming Soon" checkbox
- [ ] Changes save correctly to database
- [ ] Pricing page shows "Coming Soon" badge for marked packages
- [ ] Purchase button is disabled for coming soon packages
- [ ] Purchase button shows "Coming Soon" text instead of "Subscribe Now"
- [ ] Button has greyed-out styling when disabled
- [ ] Backend payment validation prevents purchase of coming soon tiers
- [ ] Helper function `is_tier_purchasable()` returns correct values
- [ ] Existing packages remain purchasable after migration

## Migration Rollback (if needed)

If you need to rollback this feature:

```sql
-- Remove the column
ALTER TABLE subscription_tiers DROP COLUMN IF EXISTS coming_soon;

-- Remove the function
DROP FUNCTION IF EXISTS is_tier_purchasable(UUID);

-- Remove the index
DROP INDEX IF EXISTS idx_subscription_tiers_available;
```

## Notes

- The `coming_soon` field defaults to `FALSE`, so existing packages remain available
- Packages must have both `is_active = TRUE` AND `coming_soon = FALSE` to be purchasable
- Admins can still view and edit coming soon packages in the admin panel
- The RLS policies already in place allow admins to update this field
