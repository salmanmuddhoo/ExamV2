# Background Queue System Implementation

## Overview

This document describes the implementation of the **Background Queue System** for PDF processing in ExamV2. This system allows administrators to upload multiple exam papers without waiting for each one to complete processing.

## Architecture

### Components

1. **Database Layer** (`processing_jobs` table)
   - Stores all background processing jobs
   - Tracks job status, progress, and results
   - Supports priority-based processing

2. **API Layer** (Supabase Edge Functions)
   - `create-exam-paper-job`: Creates a new job and returns immediately
   - `process-background-jobs`: Processes pending jobs from the queue
   - `process-exam-paper`: Existing function (now called by background processor)

3. **Frontend Layer** (React Components)
   - `JobStatusTracker`: Displays real-time job status and progress
   - `ExamPaperManager`: Modified to use the background queue
   - Real-time updates via Supabase Realtime subscriptions

## How It Works

### Upload Flow

```
1. User uploads PDF
   ↓
2. PDF stored in Supabase Storage
   ↓
3. Exam paper record created in database
   ↓
4. PDF converted to base64 images (client-side)
   ↓
5. Job created in processing_jobs table
   ↓
6. User gets immediate confirmation ✅
   ↓
7. Background processor picks up job
   ↓
8. AI processes the exam paper
   ↓
9. Questions saved to database
   ↓
10. Job marked as completed
    ↓
11. Real-time update sent to frontend
```

### Benefits

✅ **Immediate Response**: Upload returns in < 5 seconds
✅ **Multiple Uploads**: Upload 10+ papers without waiting
✅ **Real-time Updates**: See progress via Supabase Realtime
✅ **Error Recovery**: Failed jobs can be retried automatically
✅ **Priority Queue**: High-priority jobs processed first

## Database Schema

### `processing_jobs` Table

```sql
CREATE TABLE processing_jobs (
    id UUID PRIMARY KEY,
    job_type TEXT NOT NULL,
    status TEXT NOT NULL,
    priority INTEGER DEFAULT 0,
    exam_paper_id UUID REFERENCES exam_papers(id),
    payload JSONB,
    progress_percentage INTEGER,
    current_step TEXT,
    result JSONB,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    created_at TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    updated_at TIMESTAMP,
    created_by UUID
);
```

### Key Functions

- `get_next_processing_job()`: Returns next job from queue (priority-based)
- `complete_processing_job()`: Marks job as completed
- `fail_processing_job()`: Marks job as failed (with retry logic)
- `update_job_progress()`: Updates progress percentage and current step
- `cleanup_old_processing_jobs()`: Removes old jobs (runs daily)

## API Endpoints

### POST `/functions/v1/create-exam-paper-job`

Creates a new processing job.

**Request:**
```json
{
  "examPaperId": "uuid",
  "base64Images": ["base64...", "base64..."],
  "syllabusId": "uuid (optional)",
  "hasInsert": false,
  "priority": 0
}
```

**Response:**
```json
{
  "success": true,
  "jobId": "uuid",
  "message": "Job created successfully",
  "estimatedTime": 20
}
```

### POST `/functions/v1/process-background-jobs`

Processes the next pending job in the queue. Called automatically when jobs are created.

**Response:**
```json
{
  "success": true,
  "jobId": "uuid"
}
```

## Frontend Integration

### JobStatusTracker Component

```tsx
<JobStatusTracker
  userId={user.id}
  onJobComplete={() => fetchData()}
/>
```

Features:
- Displays all active and recent jobs
- Real-time progress updates via Supabase Realtime
- Shows current step and progress percentage
- Handles job completion callbacks

### Real-time Subscriptions

```typescript
supabase
  .channel('processing_jobs_changes')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'processing_jobs',
  }, (payload) => {
    // Handle job updates
  })
  .subscribe();
```

## Job States

- **pending**: Job is waiting to be processed
- **processing**: Job is currently being processed
- **completed**: Job finished successfully
- **failed**: Job failed (may be retried)

## Progress Steps

1. **Queued for processing** (0%)
2. **Converting PDF to images** (5%)
3. **Analyzing exam paper with AI** (10%)
4. **Finalizing** (90%)
5. **Completed** (100%)

## Error Handling

- Failed jobs are automatically retried up to 3 times
- Error messages and details stored in the database
- Admin can view error details in the UI
- Critical errors prevent retries (e.g., invalid data)

## Migration

File: `supabase/migrations/20260208000001_create_processing_jobs_queue.sql`

To apply:
```bash
supabase db reset  # In development
# OR
supabase db push   # In production
```

## Testing

### Manual Testing

1. Upload an exam paper PDF
2. Verify job appears in JobStatusTracker
3. Check progress updates in real-time
4. Verify job completes and questions are saved
5. Upload multiple papers to test parallel processing

### Database Queries

```sql
-- View all jobs
SELECT * FROM processing_jobs ORDER BY created_at DESC;

-- View pending jobs
SELECT * FROM processing_jobs WHERE status = 'pending';

-- View failed jobs
SELECT * FROM processing_jobs WHERE status = 'failed';

-- Manually trigger next job
SELECT get_next_processing_job();
```

## Future Enhancements

- [ ] Add support for batch uploads (multiple PDFs at once)
- [ ] Implement job cancellation
- [ ] Add job priority UI (high/normal/low)
- [ ] Email notifications when jobs complete
- [ ] Job history and statistics dashboard
- [ ] Support for other job types (retag-questions, etc.)

## Troubleshooting

### Jobs stuck in "pending" state

Check if background processor is running:
```sql
SELECT * FROM processing_jobs WHERE status = 'pending' ORDER BY created_at;
```

Manually trigger processor via API or database function.

### Jobs failing repeatedly

Check error messages:
```sql
SELECT id, error_message, retry_count
FROM processing_jobs
WHERE status = 'failed';
```

Common issues:
- Invalid API keys
- Insufficient credits
- Malformed PDF files
- Network timeouts

## Performance Considerations

- Each job processes independently
- No limit on concurrent jobs (handled by Supabase)
- Large PDFs (50+ pages) may take 2-3 minutes
- Realtime subscriptions are efficient (minimal overhead)

## Security

- Row Level Security (RLS) enabled on `processing_jobs`
- Only admins can create and view jobs
- Service role required for background processing
- All API endpoints require authentication

---

**Implementation Date**: February 8, 2026
**Author**: Claude Code
**Status**: Completed
