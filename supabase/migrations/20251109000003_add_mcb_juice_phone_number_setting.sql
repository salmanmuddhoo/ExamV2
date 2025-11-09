-- Add MCB Juice phone number configuration to system_settings
INSERT INTO system_settings (setting_key, setting_value, description)
VALUES (
  'mcb_juice_phone_number',
  '{"phone_number": "5822 2428"}'::jsonb,
  'MCB Juice phone number for manual transfers. Displayed to users during payment.'
)
ON CONFLICT (setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value,
    description = EXCLUDED.description,
    updated_at = NOW();

COMMENT ON COLUMN system_settings.setting_value IS 'JSON value for flexible configuration storage. For mcb_juice_phone_number: {"phone_number": "XXXX XXXX"}';
