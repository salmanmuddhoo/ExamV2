# Syllabus Processing - Debugging Guide

## Error: "Edge Function returned a non-2xx status code"

This means the Edge Function is running but encountering an error. Here's how to debug:

### Step 1: Redeploy with Enhanced Logging

```bash
npx supabase functions deploy extract-syllabus-chapters
```

### Step 2: Check Function Logs

After uploading a syllabus, immediately check the logs:

```bash
npx supabase functions logs extract-syllabus-chapters --tail
```

Or view in Supabase Dashboard:
1. Go to your Supabase project
2. Edge Functions → extract-syllabus-chapters
3. Click "Logs"

### Step 3: Common Issues to Check

#### 1. Missing Environment Variables
**Error:** "GEMINI_UPLOAD_API_KEY or GEMINI_API_KEY not configured"

**Fix:**
```bash
# Check if secrets are set
npx supabase secrets list

# If missing, set it
npx supabase secrets set GEMINI_API_KEY=your_api_key_here
```

#### 2. File Upload to Gemini Fails
**Error:** "Failed to upload PDF to Gemini"

**Causes:**
- Invalid Gemini API key
- File too large (>10MB)
- Network issues

**Check:**
- Verify API key is correct
- Check file size
- Check Gemini API status

#### 3. JSON Parsing Error
**Error:** "Could not extract valid JSON from AI response"

**Causes:**
- Gemini returned markdown-wrapped JSON
- Gemini didn't understand the prompt
- Response was truncated

**Check logs for:**
- The actual Gemini response
- Whether JSON parsing succeeded

#### 4. No Chapters Extracted
**Error:** "No chapters extracted from syllabus"

**Causes:**
- PDF is scanned image (not searchable text)
- Syllabus format not recognized
- PDF is corrupted

**Try:**
- Use a text-based PDF (not scanned images)
- Test with a simple, well-formatted syllabus first

### Step 4: Browser Console Debugging

Open browser DevTools console when uploading:

1. Press F12
2. Go to Console tab
3. Upload syllabus
4. Check logs for:
   ```
   Calling extract-syllabus-chapters function...
   Function response: {...}
   ```

### Step 5: Test with Sample Syllabus

Create a simple test PDF with clear chapter structure:

```
Mathematics Syllabus

Chapter 1: Algebra
- Linear equations
- Quadratic equations
- Polynomials

Chapter 2: Geometry
- Triangles
- Circles
- Coordinate geometry

Chapter 3: Calculus
- Differentiation
- Integration
- Limits
```

### Step 6: Manual Function Test

Test the function directly via curl:

```bash
# Get your function URL and anon key from Supabase dashboard
curl -X POST https://your-project.supabase.co/functions/v1/extract-syllabus-chapters \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "syllabusId": "test-id",
    "fileUrl": "https://your-file-url.pdf"
  }'
```

### Expected Flow

**Success:**
1. Upload PDF → Status: "pending"
2. Function called → Status: "processing"
3. PDF uploaded to Gemini
4. Gemini analyzes and returns JSON
5. Chapters saved to database
6. Status: "completed"

**Failure Points:**
- ❌ Missing API key → 500 error
- ❌ Invalid file URL → Fetch fails
- ❌ Gemini API error → 500 error
- ❌ JSON parse fails → Processing error
- ❌ Database insert fails → Transaction error

### Detailed Error Messages

With enhanced logging, you'll see:

```
✅ Good:
Extract syllabus chapters function invoked
Request received - syllabusId: xxx, fileUrl: xxx
Extracting chapters from syllabus: xxx
PDF uploaded to Gemini: xxx
File is ready for processing
Gemini response received
Extracted 5 chapters
Chapters saved successfully

❌ Bad:
Extract syllabus chapters function invoked
Request received - syllabusId: xxx, fileUrl: xxx
GEMINI API key not configured
```

### Quick Fixes

**Problem:** Function not found
```bash
npx supabase functions list
# If not listed:
npx supabase functions deploy extract-syllabus-chapters
```

**Problem:** CORS error
```bash
# Already fixed - just redeploy
npx supabase functions deploy extract-syllabus-chapters
```

**Problem:** Timeout
- Large PDFs may take 30-60 seconds
- Wait longer or check logs for actual error

**Problem:** Invalid response format
- Check Gemini response in logs
- May need to adjust prompt
- Add fallback parsing logic

## Testing Checklist

Before considering it "working":

- [ ] Deploy function successfully
- [ ] Set GEMINI_API_KEY
- [ ] Upload small test PDF (1-2 pages)
- [ ] Check browser console - no errors
- [ ] Check function logs - shows success
- [ ] Status changes: pending → processing → completed
- [ ] Click "View Chapters" - chapters displayed
- [ ] Edit a chapter - saves successfully
- [ ] Upload another syllabus - works again

## Get Help

If still failing after all checks:

1. Share function logs
2. Share browser console output
3. Share the PDF being used (if possible)
4. Share the error message

## Rollback Plan

If the function is completely broken:

```bash
# Remove the function
npx supabase functions delete extract-syllabus-chapters

# Mark all processing syllabi as failed
# (Run in Supabase SQL Editor)
UPDATE syllabus
SET processing_status = 'failed',
    error_message = 'Function temporarily disabled'
WHERE processing_status = 'processing';
```
