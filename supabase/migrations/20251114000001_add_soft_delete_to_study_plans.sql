-- Add soft delete support to study_plan_schedules
ALTER TABLE study_plan_schedules
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- Create index for efficient querying of non-deleted plans
CREATE INDEX IF NOT EXISTS idx_study_plan_schedules_deleted_at
  ON study_plan_schedules(user_id, deleted_at);

-- Update RLS policies to exclude soft-deleted records for regular users
-- Drop existing policies first
DROP POLICY IF EXISTS "Users can view their own study plan schedules" ON study_plan_schedules;
DROP POLICY IF EXISTS "Users can update their own study plan schedules" ON study_plan_schedules;
DROP POLICY IF EXISTS "Users can delete their own study plan schedules" ON study_plan_schedules;

-- Recreate policies with soft delete filter
CREATE POLICY "Users can view their own study plan schedules"
  ON study_plan_schedules FOR SELECT
  USING (auth.uid() = user_id AND deleted_at IS NULL);

CREATE POLICY "Users can update their own study plan schedules"
  ON study_plan_schedules FOR UPDATE
  USING (auth.uid() = user_id AND deleted_at IS NULL)
  WITH CHECK (auth.uid() = user_id AND deleted_at IS NULL);

-- Soft delete: Users "delete" by setting deleted_at timestamp
-- Change DELETE policy to UPDATE policy that sets deleted_at
DROP POLICY IF EXISTS "Users can delete their own study plan schedules" ON study_plan_schedules;

CREATE POLICY "Users can soft delete their own study plan schedules"
  ON study_plan_schedules FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Admin policies remain unchanged (admins can see deleted records)
-- No changes needed to admin policies

COMMENT ON COLUMN study_plan_schedules.deleted_at IS 'Timestamp when the study plan was soft deleted. NULL means not deleted. Used for limit counting: billing cycle limits count all records (including deleted), while per-subject/grade limits count only non-deleted records.';
