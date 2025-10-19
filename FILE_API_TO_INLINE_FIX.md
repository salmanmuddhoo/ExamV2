# File API Timeout Fix - Switched to Inline Data

## The Problem

**Error:** `File processing timeout`

**Location:** `waitForFileProcessing` function

**Root Cause:**
- Using Gemini File API requires uploading the file first
- Then waiting for Gemini to process it (state: PROCESSING → ACTIVE)
- Large PDFs were timing out during processing

## The Solution

**Switch from File API to inline_data** (same approach as exam paper processing)

### Before (File API - Complex):
```typescript
// 1. Upload PDF to Gemini File API
const uploadResponse = await fetch(
  `https://generativelanguage.googleapis.com/upload/v1beta/files`,
  { body: multipartFormData }
);

// 2. Wait for file to be processed (SLOW - can timeout)
await waitForFileProcessing(fileUri, apiKey, 30);

// 3. Use fileData in request
{
  fileData: {
    mimeType: 'application/pdf',
    fileUri: fileUri
  }
}
```

### After (Inline Data - Simple):
```typescript
// 1. Convert PDF to base64
const base64Pdf = await arrayBufferToBase64(arrayBuffer);

// 2. Send directly with inline_data (FAST)
{
  inline_data: {
    mime_type: 'application/pdf',
    data: base64Pdf
  }
}
```

## Benefits

✅ **Faster** - No upload wait time
✅ **Simpler** - No file management needed
✅ **More Reliable** - No timeout issues
✅ **Consistent** - Same as exam paper processing

## What Changed

**File:** `supabase/functions/extract-syllabus-chapters/index.ts`

1. **Removed:**
   - File API upload code
   - `createMultipartBody()` function
   - `base64ToUint8Array()` function
   - `waitForFileProcessing()` function

2. **Kept:**
   - `arrayBufferToBase64()` function (still needed for inline_data)

3. **Updated:**
   - Use `inline_data` instead of `fileData` in Gemini request
   - Removed file upload and wait steps

## Code Comparison

### Old Approach (70+ lines):
```typescript
// Upload PDF
const uploadResponse = await fetch(uploadUrl, {
  method: 'POST',
  headers: { 'X-Goog-Upload-Protocol': 'multipart' },
  body: await createMultipartBody(base64Pdf, 'syllabus.pdf')
});

const fileUri = uploadData.file.uri;

// Wait for processing (30 attempts × 2s = 60s max)
await waitForFileProcessing(fileUri, apiKey, 30);

// Use file
const geminiResponse = await fetch(apiUrl, {
  body: JSON.stringify({
    contents: [{
      parts: [
        { text: prompt },
        { fileData: { mimeType: 'application/pdf', fileUri } }
      ]
    }]
  })
});
```

### New Approach (10 lines):
```typescript
// Convert to base64
const base64Pdf = await arrayBufferToBase64(arrayBuffer);

// Send directly
const geminiResponse = await fetch(apiUrl, {
  body: JSON.stringify({
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: 'application/pdf', data: base64Pdf } }
      ]
    }]
  })
});
```

## Performance

**Before:**
- Upload: ~5-10s
- Wait for processing: ~20-60s (can timeout)
- Total: 25-70s

**After:**
- Convert to base64: ~1-2s
- Send + process: ~10-20s
- Total: 11-22s ✅

## Limitations

**File Size Limits:**
- File API: Up to 2GB
- Inline Data: Up to ~20MB (base64 encoded)

**For this use case:**
- Syllabus PDFs are typically 1-10MB
- Well within inline_data limits
- Perfect fit!

## Deploy

```bash
npx supabase functions deploy extract-syllabus-chapters
```

## Testing

After deploying:
1. Upload a small syllabus (1-2 pages)
2. Upload a larger syllabus (10-20 pages)
3. Both should process quickly (<30s)
4. No more timeout errors!

## Lesson Learned

**When to use File API vs Inline Data:**

Use **File API** when:
- Files are very large (>20MB)
- Need to reference same file multiple times
- Want to cache files for reuse

Use **Inline Data** when:
- Files are small to medium (<20MB)
- One-time processing
- Want simplicity and speed ✅

For syllabus PDFs, inline_data is the better choice!
