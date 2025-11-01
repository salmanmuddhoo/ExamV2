-- Cleanup: Drop the old version of get_user_paper_access_status
-- This must be run BEFORE 20251025000004_add_ids_to_paper_access_status.sql
-- Required because the return type is changing (adding subject_id and grade_level_id)

-- Drop the function with CASCADE to remove any dependencies
DROP FUNCTION IF EXISTS get_user_paper_access_status(UUID) CASCADE;

-- Confirm the drop
DO $$
BEGIN
  RAISE NOTICE 'Successfully dropped get_user_paper_access_status function. You can now apply migration 20251025000004.';
END $$;
