-- Migration: Create Coupon Code System
-- Description: Adds coupon code functionality for discount codes at checkout
-- Author: Claude
-- Date: 2025-10-28

-- =====================================================
-- 0. CREATE HELPER FUNCTION FOR UPDATED_AT
-- =====================================================

-- Create a generic function to update updated_at timestamp if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION public.update_updated_at_column IS 'Generic trigger function to update updated_at timestamp';

-- =====================================================
-- 1. CREATE COUPON_CODES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.coupon_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,
    description TEXT,
    discount_percentage INTEGER NOT NULL CHECK (discount_percentage > 0 AND discount_percentage <= 100),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    max_uses INTEGER, -- NULL means unlimited uses
    current_uses INTEGER NOT NULL DEFAULT 0,
    applicable_tiers UUID[] NOT NULL DEFAULT '{}', -- Empty array means all tiers
    applicable_billing_cycles TEXT[] NOT NULL DEFAULT '{}', -- Empty array means all cycles ('monthly', 'yearly')
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_date_range CHECK (valid_until > valid_from),
    CONSTRAINT valid_billing_cycles CHECK (
        applicable_billing_cycles <@ ARRAY['monthly', 'yearly']::TEXT[]
    )
);

-- Add indexes for performance
CREATE INDEX idx_coupon_codes_code ON public.coupon_codes(UPPER(code));
CREATE INDEX idx_coupon_codes_valid_dates ON public.coupon_codes(valid_from, valid_until);
CREATE INDEX idx_coupon_codes_is_active ON public.coupon_codes(is_active);
CREATE INDEX idx_coupon_codes_created_at ON public.coupon_codes(created_at DESC);

-- Add updated_at trigger
CREATE TRIGGER update_coupon_codes_updated_at
    BEFORE UPDATE ON public.coupon_codes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comment
COMMENT ON TABLE public.coupon_codes IS 'Stores coupon codes that students can use for discounts at checkout';

-- =====================================================
-- 2. CREATE COUPON_USAGES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.coupon_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coupon_id UUID NOT NULL REFERENCES public.coupon_codes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    payment_transaction_id UUID REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
    discount_amount DECIMAL(10, 2) NOT NULL,
    original_amount DECIMAL(10, 2) NOT NULL,
    final_amount DECIMAL(10, 2) NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT valid_amounts CHECK (
        discount_amount >= 0 AND
        final_amount >= 0 AND
        original_amount > 0 AND
        final_amount = original_amount - discount_amount
    )
);

-- Add indexes for performance
CREATE INDEX idx_coupon_usages_coupon_id ON public.coupon_usages(coupon_id);
CREATE INDEX idx_coupon_usages_user_id ON public.coupon_usages(user_id);
CREATE INDEX idx_coupon_usages_payment_transaction_id ON public.coupon_usages(payment_transaction_id);
CREATE INDEX idx_coupon_usages_created_at ON public.coupon_usages(created_at DESC);

-- Add comment
COMMENT ON TABLE public.coupon_usages IS 'Tracks each time a coupon code is used by a student';

-- =====================================================
-- 3. CREATE RLS POLICIES
-- =====================================================

-- Enable RLS
ALTER TABLE public.coupon_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_usages ENABLE ROW LEVEL SECURITY;

-- Policies for coupon_codes
-- Admins can do everything
CREATE POLICY "Admins can view all coupon codes"
    ON public.coupon_codes
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_admin = TRUE
        )
    );

CREATE POLICY "Admins can create coupon codes"
    ON public.coupon_codes
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_admin = TRUE
        )
    );

CREATE POLICY "Admins can update coupon codes"
    ON public.coupon_codes
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_admin = TRUE
        )
    );

CREATE POLICY "Admins can delete coupon codes"
    ON public.coupon_codes
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_admin = TRUE
        )
    );

-- Users can view active, valid coupon codes (for validation purposes)
-- But this is handled via function calls, so we don't expose the table directly to users

-- Policies for coupon_usages
-- Users can view their own coupon usages
CREATE POLICY "Users can view their own coupon usages"
    ON public.coupon_usages
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

-- Admins can view all coupon usages
CREATE POLICY "Admins can view all coupon usages"
    ON public.coupon_usages
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.is_admin = TRUE
        )
    );

-- System can create coupon usages (via function)
CREATE POLICY "Authenticated users can create coupon usages"
    ON public.coupon_usages
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- =====================================================
-- 4. CREATE VALIDATION FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION public.validate_coupon_code(
    p_code TEXT,
    p_tier_id UUID,
    p_billing_cycle TEXT,
    p_user_id UUID DEFAULT NULL
)
RETURNS TABLE (
    is_valid BOOLEAN,
    coupon_id UUID,
    discount_percentage INTEGER,
    error_message TEXT
) AS $$
DECLARE
    v_coupon RECORD;
    v_user_id UUID;
BEGIN
    -- Use provided user_id or default to auth.uid()
    v_user_id := COALESCE(p_user_id, auth.uid());

    -- Check if code exists (case-insensitive)
    SELECT * INTO v_coupon
    FROM public.coupon_codes
    WHERE UPPER(code) = UPPER(p_code);

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, NULL::INTEGER, 'Invalid coupon code'::TEXT;
        RETURN;
    END IF;

    -- Check if coupon is active
    IF NOT v_coupon.is_active THEN
        RETURN QUERY SELECT FALSE, v_coupon.id, NULL::INTEGER, 'This coupon code is no longer active'::TEXT;
        RETURN;
    END IF;

    -- Check if coupon is within valid date range
    IF NOW() < v_coupon.valid_from THEN
        RETURN QUERY SELECT FALSE, v_coupon.id, NULL::INTEGER, 'This coupon code is not yet valid'::TEXT;
        RETURN;
    END IF;

    IF NOW() > v_coupon.valid_until THEN
        RETURN QUERY SELECT FALSE, v_coupon.id, NULL::INTEGER, 'This coupon code has expired'::TEXT;
        RETURN;
    END IF;

    -- Check if coupon has reached max uses
    IF v_coupon.max_uses IS NOT NULL AND v_coupon.current_uses >= v_coupon.max_uses THEN
        RETURN QUERY SELECT FALSE, v_coupon.id, NULL::INTEGER, 'This coupon code has reached its maximum number of uses'::TEXT;
        RETURN;
    END IF;

    -- Check if coupon applies to this tier (empty array means all tiers)
    IF array_length(v_coupon.applicable_tiers, 1) > 0 AND NOT (p_tier_id = ANY(v_coupon.applicable_tiers)) THEN
        RETURN QUERY SELECT FALSE, v_coupon.id, NULL::INTEGER, 'This coupon code is not applicable to the selected subscription tier'::TEXT;
        RETURN;
    END IF;

    -- Check if coupon applies to this billing cycle (empty array means all cycles)
    IF array_length(v_coupon.applicable_billing_cycles, 1) > 0 AND NOT (p_billing_cycle = ANY(v_coupon.applicable_billing_cycles)) THEN
        RETURN QUERY SELECT FALSE, v_coupon.id, NULL::INTEGER, 'This coupon code is not applicable to the selected billing cycle'::TEXT;
        RETURN;
    END IF;

    -- All checks passed
    RETURN QUERY SELECT TRUE, v_coupon.id, v_coupon.discount_percentage, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON FUNCTION public.validate_coupon_code IS 'Validates a coupon code and returns discount percentage if valid';

-- =====================================================
-- 5. CREATE APPLY COUPON FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION public.apply_coupon_code(
    p_coupon_code TEXT,
    p_payment_transaction_id UUID,
    p_original_amount DECIMAL,
    p_currency TEXT DEFAULT 'USD'
)
RETURNS TABLE (
    success BOOLEAN,
    final_amount DECIMAL,
    discount_amount DECIMAL,
    error_message TEXT
) AS $$
DECLARE
    v_validation RECORD;
    v_payment_transaction RECORD;
    v_discount_amount DECIMAL;
    v_final_amount DECIMAL;
BEGIN
    -- Get payment transaction details
    SELECT * INTO v_payment_transaction
    FROM public.payment_transactions
    WHERE id = p_payment_transaction_id;

    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::DECIMAL, NULL::DECIMAL, 'Payment transaction not found'::TEXT;
        RETURN;
    END IF;

    -- Validate coupon
    SELECT * INTO v_validation
    FROM public.validate_coupon_code(
        p_coupon_code,
        v_payment_transaction.tier_id,
        v_payment_transaction.billing_cycle,
        v_payment_transaction.user_id
    );

    IF NOT v_validation.is_valid THEN
        RETURN QUERY SELECT FALSE, NULL::DECIMAL, NULL::DECIMAL, v_validation.error_message;
        RETURN;
    END IF;

    -- Calculate discount
    v_discount_amount := ROUND(p_original_amount * v_validation.discount_percentage / 100.0, 2);
    v_final_amount := p_original_amount - v_discount_amount;

    -- Ensure final amount is not negative
    IF v_final_amount < 0 THEN
        v_final_amount := 0;
        v_discount_amount := p_original_amount;
    END IF;

    -- Record coupon usage
    INSERT INTO public.coupon_usages (
        coupon_id,
        user_id,
        payment_transaction_id,
        discount_amount,
        original_amount,
        final_amount,
        currency
    ) VALUES (
        v_validation.coupon_id,
        v_payment_transaction.user_id,
        p_payment_transaction_id,
        v_discount_amount,
        p_original_amount,
        v_final_amount,
        p_currency
    );

    -- Increment coupon usage count
    UPDATE public.coupon_codes
    SET current_uses = current_uses + 1,
        updated_at = NOW()
    WHERE id = v_validation.coupon_id;

    -- Update payment transaction with coupon info
    UPDATE public.payment_transactions
    SET metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
            'coupon_code', p_coupon_code,
            'coupon_id', v_validation.coupon_id,
            'discount_percentage', v_validation.discount_percentage,
            'original_amount', p_original_amount,
            'discount_amount', v_discount_amount
        ),
        amount = v_final_amount,
        updated_at = NOW()
    WHERE id = p_payment_transaction_id;

    RETURN QUERY SELECT TRUE, v_final_amount, v_discount_amount, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comment
COMMENT ON FUNCTION public.apply_coupon_code IS 'Applies a coupon code to a payment transaction and records the usage';

-- =====================================================
-- 6. CREATE HELPER VIEW FOR ADMIN ANALYTICS
-- =====================================================

CREATE OR REPLACE VIEW public.coupon_analytics AS
SELECT
    cc.id,
    cc.code,
    cc.description,
    cc.discount_percentage,
    cc.valid_from,
    cc.valid_until,
    cc.is_active,
    cc.max_uses,
    cc.current_uses,
    cc.created_at,
    COALESCE(COUNT(DISTINCT cu.id), 0) AS total_usages,
    COALESCE(COUNT(DISTINCT cu.user_id), 0) AS unique_users,
    COALESCE(SUM(cu.discount_amount), 0) AS total_discount_given,
    COALESCE(SUM(cu.original_amount), 0) AS total_original_amount,
    COALESCE(SUM(cu.final_amount), 0) AS total_final_amount,
    -- Status calculation
    CASE
        WHEN NOT cc.is_active THEN 'inactive'
        WHEN NOW() < cc.valid_from THEN 'scheduled'
        WHEN NOW() > cc.valid_until THEN 'expired'
        WHEN cc.max_uses IS NOT NULL AND cc.current_uses >= cc.max_uses THEN 'maxed_out'
        ELSE 'active'
    END AS status
FROM public.coupon_codes cc
LEFT JOIN public.coupon_usages cu ON cc.id = cu.coupon_id
GROUP BY cc.id, cc.code, cc.description, cc.discount_percentage,
         cc.valid_from, cc.valid_until, cc.is_active, cc.max_uses,
         cc.current_uses, cc.created_at;

-- Grant access to view
GRANT SELECT ON public.coupon_analytics TO authenticated;

-- Add RLS policy for the view
ALTER VIEW public.coupon_analytics SET (security_invoker = true);

-- Add comment
COMMENT ON VIEW public.coupon_analytics IS 'Analytics view for coupon codes showing usage statistics';

-- =====================================================
-- 7. GRANT PERMISSIONS
-- =====================================================

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupon_codes TO authenticated;
GRANT SELECT, INSERT ON public.coupon_usages TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- =====================================================
-- 8. INSERT SAMPLE DATA (FOR TESTING)
-- =====================================================

-- Insert a sample coupon code for testing
-- Note: You may want to remove this in production
INSERT INTO public.coupon_codes (
    code,
    description,
    discount_percentage,
    valid_from,
    valid_until,
    is_active,
    max_uses,
    applicable_tiers,
    applicable_billing_cycles
) VALUES (
    'WELCOME10',
    'Welcome discount - 10% off for new students',
    10,
    NOW(),
    NOW() + INTERVAL '90 days',
    TRUE,
    NULL, -- Unlimited uses
    '{}', -- All tiers
    '{}' -- All billing cycles
) ON CONFLICT (code) DO NOTHING;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
