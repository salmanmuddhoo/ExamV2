-- Create currency exchange rates table
-- This table stores exchange rates relative to USD (base currency)

CREATE TABLE IF NOT EXISTS currency_exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  currency_code TEXT NOT NULL UNIQUE CHECK (currency_code IN ('USD', 'EUR', 'GBP', 'MUR', 'INR')),
  currency_name TEXT NOT NULL,
  currency_symbol TEXT NOT NULL,
  rate_to_usd NUMERIC(10, 4) NOT NULL CHECK (rate_to_usd > 0),
  -- USD will have rate_to_usd = 1.0
  -- For other currencies: rate_to_usd = how many units of currency equals 1 USD
  -- Example: If 1 USD = 50 MUR, then rate_to_usd = 50

  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add comments
COMMENT ON TABLE currency_exchange_rates IS 'Stores exchange rates for currency conversion. All rates are relative to USD as the base currency.';
COMMENT ON COLUMN currency_exchange_rates.rate_to_usd IS 'How many units of this currency equals 1 USD. Example: If 1 USD = 50 MUR, rate_to_usd = 50';

-- Insert default exchange rates
INSERT INTO currency_exchange_rates (currency_code, currency_name, currency_symbol, rate_to_usd)
VALUES
  ('USD', 'US Dollar', '$', 1.0),
  ('EUR', 'Euro', '€', 0.92),  -- Approximate rate
  ('GBP', 'British Pound', '£', 0.79),  -- Approximate rate
  ('MUR', 'Mauritian Rupee', 'Rs', 45.0),  -- Approximate rate
  ('INR', 'Indian Rupee', '₹', 83.0)  -- Approximate rate
ON CONFLICT (currency_code) DO NOTHING;

-- Create function to get converted price
CREATE OR REPLACE FUNCTION convert_price(
  p_price_usd NUMERIC,
  p_target_currency TEXT
)
RETURNS NUMERIC AS $$
DECLARE
  v_rate NUMERIC;
BEGIN
  -- Get the exchange rate for target currency
  SELECT rate_to_usd INTO v_rate
  FROM currency_exchange_rates
  WHERE currency_code = p_target_currency;

  -- If currency not found, return original USD price
  IF v_rate IS NULL THEN
    RETURN p_price_usd;
  END IF;

  -- Convert: price_in_currency = price_in_usd * rate_to_usd
  RETURN ROUND(p_price_usd * v_rate, 2);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION convert_price IS 'Converts a USD price to the target currency using current exchange rates';

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_currency_exchange_rate_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_currency_exchange_rate_updated_at
  BEFORE UPDATE ON currency_exchange_rates
  FOR EACH ROW
  EXECUTE FUNCTION update_currency_exchange_rate_updated_at();

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_currency_exchange_rates_code
  ON currency_exchange_rates(currency_code);
