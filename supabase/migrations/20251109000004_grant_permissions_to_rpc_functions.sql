-- Grant permissions to RPC functions that users need to access
-- This fixes 404 errors when calling these functions from the client

-- Grant execute permission on get_user_paper_access_status to authenticated users
GRANT EXECUTE ON FUNCTION get_user_paper_access_status(UUID) TO authenticated;

-- Grant execute permission on get_accessible_grades_for_user to authenticated users
GRANT EXECUTE ON FUNCTION get_accessible_grades_for_user(UUID) TO authenticated, anon;

COMMENT ON FUNCTION get_user_paper_access_status IS 'Returns all papers with their access status for a user. Fixed month type from TEXT to INTEGER to match exam_papers table. Grants added to allow authenticated users to call this function.';
