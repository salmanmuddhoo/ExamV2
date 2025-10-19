# PostgreSQL Type Error Fix (22P02)

## The Problem

**Error:** `invalid input syntax for type...` (PostgreSQL error code 22P02)

**Location:** When inserting chapters into `syllabus_chapters` table

**Root Cause:**
- AI (Gemini) may return data in unexpected formats
- Subtopics array might not be a proper string array
- Numbers might be strings
- Missing proper type validation before database insert

## The Solution

**Validate and sanitize ALL data before inserting into database**

### What Changed

**File:** `supabase/functions/extract-syllabus-chapters/index.ts`

#### Before (Unsafe):
```typescript
const chaptersToInsert = extractedData.chapters.map((chapter: any, index: number) => ({
  syllabus_id: syllabusId,
  chapter_number: chapter.number || index + 1,  // ❌ Might be string
  chapter_title: chapter.title || `Chapter ${index + 1}`,  // ❌ Might not be string
  chapter_description: chapter.description || null,
  subtopics: chapter.subtopics || [],  // ❌ Might not be string array
  display_order: index + 1,
  confidence_score: chapter.confidence || 0.9,  // ❌ Might be out of range
}));
```

#### After (Safe):
```typescript
const chaptersToInsert = extractedData.chapters.map((chapter: any, index: number) => {
  // Ensure subtopics is always a proper string array
  let subtopics: string[] = [];
  if (Array.isArray(chapter.subtopics)) {
    subtopics = chapter.subtopics
      .map((s: any) => String(s))  // Convert each to string
      .filter((s: string) => s.trim().length > 0);  // Remove empty strings
  }

  // Ensure chapter_number is an integer
  const chapterNumber = parseInt(String(chapter.number || index + 1));

  // Ensure confidence_score is a valid decimal (0-1)
  let confidenceScore = 0.9;
  if (typeof chapter.confidence === 'number' &&
      chapter.confidence >= 0 &&
      chapter.confidence <= 1) {
    confidenceScore = chapter.confidence;
  }

  return {
    syllabus_id: syllabusId,
    chapter_number: chapterNumber,  // ✅ Guaranteed integer
    chapter_title: String(chapter.title || `Chapter ${index + 1}`),  // ✅ Guaranteed string
    chapter_description: chapter.description ? String(chapter.description) : null,  // ✅ String or null
    subtopics: subtopics,  // ✅ Guaranteed string[]
    display_order: index + 1,
    confidence_score: confidenceScore,  // ✅ Guaranteed 0-1 decimal
  };
});
```

## Common PostgreSQL Type Errors (22P02)

### 1. Array Type Mismatch
**Problem:**
```sql
-- Database expects: text[]
-- Received: [1, 2, 3] or "string" or null
```

**Solution:**
```typescript
const textArray = Array.isArray(value)
  ? value.map(v => String(v)).filter(s => s.trim())
  : [];
```

### 2. Integer Type Mismatch
**Problem:**
```sql
-- Database expects: integer
-- Received: "123" or 123.5 or null
```

**Solution:**
```typescript
const intValue = parseInt(String(value || defaultValue));
```

### 3. String Type Mismatch
**Problem:**
```sql
-- Database expects: text
-- Received: 123 or null or undefined
```

**Solution:**
```typescript
const strValue = value ? String(value) : null;
```

### 4. Numeric Range Issues
**Problem:**
```sql
-- Database expects: numeric(3,2) (0.00 to 1.00)
-- Received: 95 or "0.95" or -1
```

**Solution:**
```typescript
let numValue = 0.9;
if (typeof value === 'number' && value >= 0 && value <= 1) {
  numValue = value;
}
```

## Enhanced Error Logging

Also added detailed logging to help debug:

```typescript
console.log('Chapters to insert:', JSON.stringify(chaptersToInsert, null, 2));

const { data, error } = await supabase
  .from('syllabus_chapters')
  .insert(chaptersToInsert)
  .select();

if (error) {
  console.error('Error inserting chapters:', error);
  console.error('Attempted to insert:', JSON.stringify(chaptersToInsert, null, 2));
  throw new Error(`Database insert failed: ${error.message} (${error.code})`);
}
```

This helps identify exactly which field caused the error.

## Why This Matters

**AI responses are unpredictable:**
- Gemini might return `"1"` instead of `1`
- Might return `null` instead of `[]`
- Might return numbers as strings
- Might include extra whitespace

**Database is strict:**
- PostgreSQL enforces type constraints
- `text[]` must be an array of strings
- `integer` must be a whole number
- `numeric(3,2)` must be 0.00-1.00

**Solution:**
Always validate and sanitize data before inserting!

## Deploy

```bash
npx supabase functions deploy extract-syllabus-chapters
```

## Testing

After deploying:
1. Upload a syllabus
2. Check function logs for "Chapters to insert" output
3. Should see properly formatted data
4. Should insert successfully without 22P02 error

## Lesson Learned

**Never trust AI output directly!**

Always:
1. ✅ Validate data types
2. ✅ Convert to expected types
3. ✅ Handle null/undefined cases
4. ✅ Provide defaults
5. ✅ Log data before inserting
6. ✅ Add detailed error messages

This is now in `DEVELOPMENT_CHECKLIST.md` for all future database operations.
