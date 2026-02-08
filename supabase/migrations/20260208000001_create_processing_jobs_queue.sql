-- Create processing jobs queue table for background PDF processing
CREATE TABLE IF NOT EXISTS processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_type TEXT NOT NULL CHECK (job_type IN ('process_exam_paper', 'retag_questions')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    priority INTEGER NOT NULL DEFAULT 0, -- Higher priority jobs processed first

    -- Job-specific data
    exam_paper_id UUID REFERENCES exam_papers(id) ON DELETE CASCADE,
    payload JSONB NOT NULL DEFAULT '{}', -- Flexible storage for job-specific data

    -- Progress tracking
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    current_step TEXT, -- e.g., "Converting PDF", "Extracting questions", "Tagging chapters"

    -- Results and errors
    result JSONB, -- Store job results (e.g., question count, token usage)
    error_message TEXT,
    error_details JSONB,

    -- Retry logic
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- User tracking
    created_by UUID REFERENCES auth.users(id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_processing_jobs_status ON processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_priority ON processing_jobs(priority DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_exam_paper ON processing_jobs(exam_paper_id);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_created_at ON processing_jobs(created_at);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_type_status ON processing_jobs(job_type, status);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_processing_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on every update
CREATE TRIGGER trigger_update_processing_jobs_updated_at
    BEFORE UPDATE ON processing_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_processing_jobs_updated_at();

-- Function to get next job from queue (prioritized)
CREATE OR REPLACE FUNCTION get_next_processing_job()
RETURNS UUID AS $$
DECLARE
    job_id UUID;
BEGIN
    -- Get highest priority pending job and mark it as processing
    UPDATE processing_jobs
    SET status = 'processing',
        started_at = NOW(),
        updated_at = NOW()
    WHERE id = (
        SELECT id
        FROM processing_jobs
        WHERE status = 'pending'
        ORDER BY priority DESC, created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
    )
    RETURNING id INTO job_id;

    RETURN job_id;
END;
$$ LANGUAGE plpgsql;

-- Function to mark job as completed
CREATE OR REPLACE FUNCTION complete_processing_job(
    p_job_id UUID,
    p_result JSONB DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE processing_jobs
    SET status = 'completed',
        completed_at = NOW(),
        progress_percentage = 100,
        result = p_result,
        updated_at = NOW()
    WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- Function to mark job as failed
CREATE OR REPLACE FUNCTION fail_processing_job(
    p_job_id UUID,
    p_error_message TEXT,
    p_error_details JSONB DEFAULT NULL,
    p_should_retry BOOLEAN DEFAULT TRUE
)
RETURNS VOID AS $$
DECLARE
    current_retry_count INTEGER;
    max_retry_count INTEGER;
BEGIN
    -- Get current retry info
    SELECT retry_count, max_retries
    INTO current_retry_count, max_retry_count
    FROM processing_jobs
    WHERE id = p_job_id;

    -- Check if we should retry
    IF p_should_retry AND current_retry_count < max_retry_count THEN
        -- Reset to pending for retry
        UPDATE processing_jobs
        SET status = 'pending',
            retry_count = retry_count + 1,
            error_message = p_error_message,
            error_details = p_error_details,
            started_at = NULL,
            updated_at = NOW()
        WHERE id = p_job_id;
    ELSE
        -- Mark as permanently failed
        UPDATE processing_jobs
        SET status = 'failed',
            completed_at = NOW(),
            error_message = p_error_message,
            error_details = p_error_details,
            updated_at = NOW()
        WHERE id = p_job_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to update job progress
CREATE OR REPLACE FUNCTION update_job_progress(
    p_job_id UUID,
    p_progress_percentage INTEGER,
    p_current_step TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE processing_jobs
    SET progress_percentage = p_progress_percentage,
        current_step = p_current_step,
        updated_at = NOW()
    WHERE id = p_job_id;
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security
ALTER TABLE processing_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Admins can see all jobs
CREATE POLICY "Admins can view all processing jobs"
    ON processing_jobs
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Admins can insert jobs
CREATE POLICY "Admins can create processing jobs"
    ON processing_jobs
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Admins can update jobs
CREATE POLICY "Admins can update processing jobs"
    ON processing_jobs
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Service role (for edge functions) can do everything
CREATE POLICY "Service role can manage all processing jobs"
    ON processing_jobs
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Add cleanup function to remove old completed jobs (optional, run periodically)
CREATE OR REPLACE FUNCTION cleanup_old_processing_jobs()
RETURNS VOID AS $$
BEGIN
    DELETE FROM processing_jobs
    WHERE status IN ('completed', 'failed')
    AND completed_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule cleanup to run daily at 2 AM (optional)
SELECT cron.schedule(
    'cleanup-old-processing-jobs',
    '0 2 * * *', -- Every day at 2 AM
    $$SELECT cleanup_old_processing_jobs()$$
);

-- Note: Background job processing is triggered automatically when jobs are created
-- via the create-exam-paper-job edge function, which calls process-background-jobs
-- This ensures immediate processing without waiting for a cron interval

COMMENT ON TABLE processing_jobs IS 'Queue for background PDF processing jobs with real-time status updates';
COMMENT ON COLUMN processing_jobs.payload IS 'Job-specific data stored as JSON (e.g., base64Images, syllabusId, etc.)';
COMMENT ON COLUMN processing_jobs.priority IS 'Higher values = higher priority. Default: 0';
COMMENT ON COLUMN processing_jobs.result IS 'Job results stored as JSON (e.g., questionCount, tokenUsage, etc.)';
