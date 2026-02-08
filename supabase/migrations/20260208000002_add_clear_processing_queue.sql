-- Add function to clear all completed and failed jobs from the processing queue
-- This allows admins to manually clear the queue when all jobs are done

CREATE OR REPLACE FUNCTION clear_completed_processing_jobs()
RETURNS TABLE(deleted_count BIGINT) AS $$
DECLARE
    count_deleted BIGINT;
BEGIN
    -- Delete all completed and failed jobs
    DELETE FROM processing_jobs
    WHERE status IN ('completed', 'failed');

    -- Get the number of deleted rows
    GET DIAGNOSTICS count_deleted = ROW_COUNT;

    -- Return the count
    RETURN QUERY SELECT count_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add RLS policy for admins to delete processing jobs
CREATE POLICY "Admins can delete processing jobs"
    ON processing_jobs
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

COMMENT ON FUNCTION clear_completed_processing_jobs() IS 'Clears all completed and failed jobs from the queue. Returns count of deleted jobs. Admin only.';
