# Question-to-Chapter Tagging System

## Overview

This system automatically analyzes exam questions and tags them with relevant syllabus chapters using AI. This creates a comprehensive question bank organized by chapter, making it easy to find questions related to specific topics.

## Features

### 1. Automatic Question Tagging
- When an exam paper is uploaded, the system automatically:
  - Extracts individual questions
  - Finds the matching syllabus for the subject/grade
  - Uses AI to analyze each question against all chapters
  - Tags questions with matching chapters and confidence scores

### 2. Question Bank by Chapter
- New admin interface showing questions organized by chapter
- Filter by subject and grade level
- View all questions tagged to each chapter
- See confidence scores and AI reasoning for each match

### 3. Multi-Chapter Support
- Questions can be tagged to multiple chapters
- Primary chapter designation for main topic
- Confidence scores (0-100%) for each chapter match

## Database Schema

### Tables Created

**question_chapter_tags**
- Links questions to chapters (many-to-many relationship)
- Stores confidence scores and AI reasoning
- Tracks which chapter is the primary match
- Supports manual overrides

**View: question_with_chapters**
- Convenient view joining questions with their chapters
- Used for reporting and analytics

## How It Works

### Upload Flow

1. **Admin uploads exam paper** (with subject and grade)
   ```
   Admin Dashboard → Exam Papers → Upload
   ```

2. **AI extracts questions** (existing functionality)
   - Splits PDF into individual questions
   - Extracts text from each question

3. **System finds matching syllabus** (new)
   - Looks up syllabus for the subject/grade
   - Retrieves all chapters from that syllabus

4. **AI analyzes and tags questions** (new)
   - Sends question text + chapter info to Gemini AI
   - AI determines which chapter(s) each question belongs to
   - Returns confidence scores and reasoning

5. **Tags saved to database** (new)
   - Creates entries in `question_chapter_tags` table
   - Links questions to chapters with metadata

### Viewing Questions by Chapter

1. Navigate to **Admin Dashboard → Question Bank**

2. Select **Subject** and **Grade Level**

3. View chapters with question counts

4. Click a chapter to expand and see all tagged questions

5. Each question shows:
   - Question number and exam details
   - Confidence score (% match)
   - Primary chapter indicator
   - AI reasoning for the match
   - Full question images

## AI Prompt Strategy

The system uses a carefully crafted prompt that:

1. Provides full chapter information (title, description, subtopics)
2. Provides question text
3. Asks AI to match questions to chapters
4. Requests confidence scores (0.00 to 1.00)
5. Asks for brief reasoning for each match
6. Filters out low-confidence matches (< 0.60)

## Token Usage and Cost

The chapter tagging adds minimal cost:
- Uses Gemini 2.0 Flash (very cost-effective)
- Only text-based analysis (no images)
- Typically ~2,000-5,000 tokens per exam paper
- Cost: ~$0.0002 - $0.0005 per exam paper

Total token usage is logged and displayed after each upload.

## Deployment Steps

### 1. Apply Database Migration

Run the migration to create the necessary tables:

```bash
# Using Supabase CLI
supabase db push

# Or manually in Supabase SQL Editor
# Run: supabase/migrations/20251020000001_add_question_chapter_tagging.sql
```

### 2. Deploy Updated Edge Function

The `process-exam-paper` function has been updated to include chapter tagging:

```bash
# Deploy the updated function
supabase functions deploy process-exam-paper
```

### 3. Deploy Frontend Changes

Build and deploy the updated React app:

```bash
npm run build
# Deploy the dist folder to your hosting service
```

## Testing the System

### Test Scenario 1: Upload Exam with Matching Syllabus

1. **Setup:**
   - Upload a syllabus for "Math, Grade 10" with chapters
   - Wait for syllabus processing to complete

2. **Test:**
   - Upload an exam paper for "Math, Grade 10"
   - Wait for processing to complete

3. **Verify:**
   - Check console logs for "Tagged X questions with chapters"
   - Navigate to Question Bank
   - Select Math and Grade 10
   - Verify questions appear under chapters

### Test Scenario 2: Upload Exam Without Syllabus

1. **Test:**
   - Upload exam paper for a subject/grade with no syllabus

2. **Expected:**
   - Questions are extracted normally
   - No chapter tagging occurs (gracefully skipped)
   - Console shows: "No completed syllabus found for this subject/grade"

### Test Scenario 3: View Question Bank

1. **Test:**
   - Navigate to Admin Dashboard → Question Bank
   - Select subject and grade

2. **Verify:**
   - Chapters appear with question counts
   - Clicking chapter shows tagged questions
   - Confidence scores are displayed
   - AI reasoning is shown

## Manual Tagging (Future Enhancement)

The system supports manual tagging via the `is_manually_set` flag:

- Admins can override AI tagging
- Manual tags are preserved during re-processing
- Useful for correcting AI mistakes

## Database Queries

### Get all questions for a chapter:
```sql
SELECT
  eq.question_number,
  eq.ocr_text,
  qct.confidence_score,
  qct.is_primary
FROM exam_questions eq
JOIN question_chapter_tags qct ON eq.id = qct.question_id
WHERE qct.chapter_id = 'chapter-uuid'
ORDER BY qct.confidence_score DESC;
```

### Get chapter statistics:
```sql
SELECT
  sc.chapter_title,
  COUNT(qct.question_id) as question_count,
  AVG(qct.confidence_score) as avg_confidence
FROM syllabus_chapters sc
LEFT JOIN question_chapter_tags qct ON sc.id = qct.chapter_id
GROUP BY sc.id, sc.chapter_title
ORDER BY sc.chapter_number;
```

### Find untagged questions:
```sql
SELECT eq.*
FROM exam_questions eq
LEFT JOIN question_chapter_tags qct ON eq.id = qct.question_id
WHERE qct.id IS NULL;
```

## Troubleshooting

### Questions not being tagged

**Check:**
1. Is there a completed syllabus for the subject/grade?
   ```sql
   SELECT * FROM syllabus
   WHERE subject_id = 'xxx'
   AND grade_id = 'yyy'
   AND processing_status = 'completed';
   ```

2. Does the syllabus have chapters?
   ```sql
   SELECT * FROM syllabus_chapters
   WHERE syllabus_id = 'syllabus-uuid';
   ```

3. Check edge function logs for errors

### Low confidence scores

**Reasons:**
- Question topic doesn't match any chapter well
- Chapter descriptions are too vague
- Question text extraction is poor

**Solutions:**
- Improve chapter descriptions in syllabus
- Add more subtopics to chapters
- Manually review and tag questions

### AI returning wrong chapter

**Solutions:**
- Check AI reasoning in the UI
- Use manual tagging to override
- Improve chapter descriptions
- Add more specific subtopics

## Future Enhancements

1. **Manual Tagging Interface**
   - Allow admins to manually tag/retag questions
   - Bulk tagging operations

2. **Student Question Bank**
   - Student-facing view of question bank
   - Practice by chapter
   - Progress tracking

3. **Question Difficulty Levels**
   - AI analyzes question difficulty
   - Tags as Easy/Medium/Hard

4. **Topic Clustering**
   - Find similar questions
   - Suggest question variations

5. **Analytics**
   - Most-tested chapters
   - Question frequency by topic
   - Difficulty distribution

## Support

For issues or questions:
1. Check Supabase logs for edge function errors
2. Review database migration status
3. Verify Gemini API key is configured
4. Check token usage logs for API failures
