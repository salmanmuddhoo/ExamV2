# Syllabus Chapter Extraction - Deployment Guide

This guide covers deploying the syllabus chapter extraction feature that uses Gemini AI.

## Prerequisites

- Supabase CLI installed
- Supabase project linked
- `GEMINI_API_KEY` or `GEMINI_UPLOAD_API_KEY` configured in Supabase Edge Functions secrets

## Step 1: Apply Database Migration

Apply the syllabus system migration:

```bash
npx supabase db push
```

Or manually run the SQL from:
- `supabase/migrations/20251019000001_create_syllabus_system.sql`

This creates:
- `syllabus` table
- `syllabus_chapters` table
- `syllabus-files` storage bucket
- All necessary RLS policies

## Step 2: Deploy Edge Function

Deploy the `extract-syllabus-chapters` function:

```bash
npx supabase functions deploy extract-syllabus-chapters
```

## Step 3: Verify API Key

Make sure your Gemini API key is set in Supabase:

```bash
npx supabase secrets list
```

You should see either `GEMINI_API_KEY` or `GEMINI_UPLOAD_API_KEY`.

If not set, add it:

```bash
npx supabase secrets set GEMINI_API_KEY=your_api_key_here
```

## How It Works

### 1. Admin Uploads Syllabus
- Admin selects subject and grade
- Uploads PDF syllabus file
- File is stored in `syllabus-files` bucket
- Database record created with status: `pending`

### 2. AI Processing (Automatic)
- Edge function `extract-syllabus-chapters` is called
- PDF is uploaded to Gemini File API
- Gemini analyzes the PDF and extracts:
  - Chapter numbers
  - Chapter titles
  - Chapter descriptions
  - Subtopics for each chapter
  - Confidence scores
- Extracted data is stored in `syllabus_chapters` table
- Status updated to `completed`

### 3. Admin Review
- Admin can view extracted chapters
- Edit chapter details if needed
- Add/remove chapters manually
- Manual edits are tracked with `is_manually_edited` flag

## Edge Function Architecture

The function follows the same pattern as `process-exam-paper`:

1. **Upload PDF to Gemini**
   - Uses multipart upload
   - Waits for file processing (state: ACTIVE)

2. **Generate Content**
   - Sends PDF file reference + prompt to Gemini
   - Requests structured JSON output with chapters

3. **Store Results**
   - Parses JSON response
   - Inserts chapters into database
   - Updates processing status

## Testing

1. Log in as admin
2. Navigate to Admin Dashboard → Syllabus tab
3. Upload a sample syllabus PDF
4. Wait for processing (status will show "Processing...")
5. Once completed, click "View Chapters"
6. Verify extracted chapters are correct

## Troubleshooting

### Function Not Working
```bash
# Check function logs
npx supabase functions logs extract-syllabus-chapters

# Test function locally
npx supabase functions serve extract-syllabus-chapters
```

### No Chapters Extracted
- Check if PDF is readable/text-based (not scanned image)
- Verify Gemini API key is valid
- Check function logs for errors

### Processing Takes Too Long
- Large PDFs may take 30-60 seconds
- File upload + processing time to Gemini
- Check network connectivity

## API Usage

The Edge Function uses the same Gemini API key as exam paper processing:
- `GEMINI_UPLOAD_API_KEY` (primary)
- `GEMINI_API_KEY` (fallback)

Token usage is similar to document analysis tasks.

## Next Steps: Phase 2

After syllabus extraction is working:
1. Modify exam upload to detect individual questions
2. Create UI to tag questions to chapters
3. Store question-chapter relationships

## Files Created

- `supabase/migrations/20251019000001_create_syllabus_system.sql` - Database schema
- `supabase/functions/extract-syllabus-chapters/index.ts` - Edge function
- `src/components/SyllabusManager.tsx` - Admin UI
- Updated `src/components/AdminDashboard.tsx` - Added Syllabus tab
