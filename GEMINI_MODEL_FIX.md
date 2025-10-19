# Gemini Model 404 Error Fix

## The Problem

**Error:** `models/gemini-1.5-flash is not found for...`

**HTTP Status:** 404

**Root Cause:** Using wrong Gemini model name

## The Solution

Use the same model as exam paper processing: **`gemini-2.0-flash-exp`**

### What Changed

**File:** `supabase/functions/extract-syllabus-chapters/index.ts`

**Before (WRONG):**
```typescript
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
```

**After (CORRECT):**
```typescript
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`;
```

## Why This Matters

Different Gemini models:
- `gemini-1.5-flash` - Older version, may not be available in all regions
- `gemini-1.5-pro` - Pro version
- `gemini-2.0-flash-exp` - ✅ **Latest experimental version, what we use**

## Consistency Across Codebase

All Gemini API calls should use: **`gemini-2.0-flash-exp`**

**Files using correct model:**
- ✅ `process-exam-paper/index.ts` - Uses `gemini-2.0-flash-exp`
- ✅ `exam-assistant/index.ts` - Uses `gemini-2.0-flash-exp`
- ✅ `extract-syllabus-chapters/index.ts` - NOW FIXED ✅

## Deploy

```bash
npx supabase functions deploy extract-syllabus-chapters
```

## Testing

After deploying:
1. Upload a syllabus PDF
2. Should no longer see 404 error
3. Should successfully extract chapters

## Added to Checklist

This is now documented in `DEVELOPMENT_CHECKLIST.md`:

```typescript
// ✅ CORRECT
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`;

// ❌ WRONG
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
```

## Remember

**Always check existing Edge Functions for the correct model name before creating new ones!**

Quick way to find it:
```bash
grep -r "models/gemini" supabase/functions/
```

Or in the codebase, look at `process-exam-paper/index.ts` as the reference.
