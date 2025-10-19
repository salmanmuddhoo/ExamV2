# Development Checklist

**Version:** v1.4 (Updated: 2025-01-19)
**Last Updated:** Use sequential numbering instead of AI-provided chapter numbers

This checklist ensures common issues are avoided in all future development.

## Version History
- **v1.4** - Use display_order for chapter_number to avoid AI duplicates
- **v1.3** - Improved delete operation with count verification and delay before insert
- **v1.2** - Added handling for unique constraint violations (23505)
- **v1.1** - Added PostgreSQL type validation (22P02)
- **v1.0** - Initial checklist with CORS, stack overflow, and Gemini patterns

## ✅ Supabase Edge Functions

### CORS Configuration
- [ ] Import CORS headers at the top:
  ```typescript
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  };
  ```

- [ ] Handle OPTIONS preflight request:
  ```typescript
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,  // Use 204 No Content for OPTIONS
      headers: corsHeaders
    });
  }
  ```

- [ ] Include CORS headers in ALL responses:
  ```typescript
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
  ```

- [ ] Include CORS headers in error responses too:
  ```typescript
  return new Response(JSON.stringify({ error: message }), {
    status: 500,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
  ```

### API Key Configuration
- [ ] Use existing environment variables:
  - `GEMINI_UPLOAD_API_KEY` (primary for document processing)
  - `GEMINI_API_KEY` (fallback)
  - NOT `ANTHROPIC_API_KEY` or other providers

- [ ] Always provide fallback:
  ```typescript
  const geminiApiKey = Deno.env.get('GEMINI_UPLOAD_API_KEY') || Deno.env.get('GEMINI_API_KEY');
  ```

- [ ] **CRITICAL:** Use the correct Gemini model:
  ```typescript
  // ✅ CORRECT - Use gemini-2.0-flash-exp (same as exam processing)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`;

  // ❌ WRONG - gemini-1.5-flash will give 404 error
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`;
  ```

### Error Handling
- [ ] Catch all errors and return proper JSON response
- [ ] Log errors to console for debugging
- [ ] Return meaningful error messages to client
- [ ] Use try-catch blocks around all async operations

### File Upload Pattern
- [ ] Follow the same pattern as `process-exam-paper` function
- [ ] Upload file to Gemini File API using multipart
- [ ] Wait for file processing (check state: ACTIVE)
- [ ] Use file URI in generateContent request
- [ ] **IMPORTANT:** Convert ArrayBuffer to base64 in chunks to avoid stack overflow:
  ```typescript
  // DON'T DO THIS (causes stack overflow on large files):
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

  // DO THIS (process in chunks):
  async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192; // 8KB chunks
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.slice(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    return btoa(binary);
  }
  ```

## ✅ TypeScript Types

### Component Props
- [ ] Define interface for all component props
- [ ] Mark optional props with `?`
- [ ] Provide default values for optional props
- [ ] Use proper types (not `any` unless necessary)

### State Types
- [ ] Define interfaces for complex state objects
- [ ] Use proper types for arrays: `Type[]` not `Array<Type>`
- [ ] Initialize state with correct type

### Supabase Queries
- [ ] Type the response data properly
- [ ] Handle null/undefined cases
- [ ] Use proper type assertions when needed
- [ ] **CRITICAL:** Handle unique constraint violations (23505) - Delete existing records before re-inserting:
  ```typescript
  // Delete existing records first (for re-processing scenarios)
  const { error: deleteError, count } = await supabase
    .from('table')
    .delete({ count: 'exact' })
    .eq('parent_id', parentId);

  if (deleteError) {
    throw new Error(`Delete failed: ${deleteError.message}`);
  }

  console.log(`Deleted ${count || 0} existing records`);

  // Small delay to ensure delete is committed
  await new Promise(resolve => setTimeout(resolve, 100));

  // Then insert new records
  const { error: insertError } = await supabase
    .from('table')
    .insert(newRecords);
  ```
- [ ] **CRITICAL:** Don't trust AI-generated IDs/numbers - use your own sequential numbering:
  ```typescript
  // ❌ BAD - AI might return duplicates
  const data = extractedData.chapters.map(chapter => ({
    chapter_number: chapter.number  // AI returned: 1, 2, 3, 3, 3, 4...
  }));

  // ✅ GOOD - Use sequential index
  const data = extractedData.chapters.map((chapter, index) => ({
    chapter_number: index + 1  // Always unique: 1, 2, 3, 4, 5...
  }));
  ```
- [ ] **CRITICAL:** Validate and sanitize data before inserting to avoid PostgreSQL type errors (22P02):
  ```typescript
  // ❌ BAD - Direct insert without validation
  const data = { subtopics: chapter.subtopics };
  await supabase.from('table').insert(data);

  // ✅ GOOD - Validate and sanitize
  const data = {
    // Ensure arrays are proper string arrays
    subtopics: Array.isArray(chapter.subtopics)
      ? chapter.subtopics.map(s => String(s)).filter(s => s.trim())
      : [],
    // Ensure integers are integers
    chapter_number: parseInt(String(chapter.number || 1)),
    // Ensure strings are strings
    title: String(chapter.title || ''),
    // Handle nulls properly
    description: chapter.description ? String(chapter.description) : null
  };
  await supabase.from('table').insert(data);
  ```

### Example:
```typescript
interface MyData {
  id: string;
  name: string;
  optional?: string;
}

const [data, setData] = useState<MyData[]>([]);
const [loading, setLoading] = useState<boolean>(false);
```

## ✅ React Components

### State Management
- [ ] Use proper initial state values
- [ ] Avoid direct state mutations
- [ ] Use functional updates for dependent state

### useEffect Dependencies
- [ ] Include all dependencies in dependency array
- [ ] Use cleanup functions when needed
- [ ] Avoid infinite loops (check dependencies)

### Event Handlers
- [ ] Type event parameters properly: `e: React.FormEvent`, `e: React.ChangeEvent<HTMLInputElement>`
- [ ] Prevent default when needed: `e.preventDefault()`
- [ ] Handle async operations properly

## ✅ Database Operations

### Supabase Client
- [ ] Use existing `supabase` instance from `lib/supabase`
- [ ] Don't create new clients unless necessary
- [ ] Handle errors from all queries

### RLS Policies
- [ ] Create policies for admins (SELECT, INSERT, UPDATE, DELETE)
- [ ] Create policies for regular users (SELECT only usually)
- [ ] Test policies with different user roles

### Migrations
- [ ] Use proper naming: `YYYYMMDDHHMMSS_description.sql`
- [ ] Include rollback instructions (as comments)
- [ ] Test migration locally before deploying
- [ ] Create indexes for foreign keys
- [ ] Enable RLS on all tables

## ✅ File Uploads

### Storage Buckets
- [ ] Create bucket in migration
- [ ] Set `public: true` for publicly accessible files
- [ ] Create proper storage policies
- [ ] Use meaningful folder structure: `{entity_id}/{filename}`

### File Handling
- [ ] Validate file types before upload
- [ ] Check file size limits
- [ ] Generate unique filenames
- [ ] Store file URLs in database
- [ ] Handle upload errors gracefully

## ✅ UI/UX

### Loading States
- [ ] Show loading spinner during async operations
- [ ] Disable buttons during processing
- [ ] Show meaningful loading messages

### Error Messages
- [ ] Show user-friendly error messages
- [ ] Log detailed errors to console
- [ ] Don't expose sensitive information in errors

### Forms
- [ ] Mark required fields with `*`
- [ ] Validate inputs before submission
- [ ] Show validation errors clearly
- [ ] Reset form after successful submission
- [ ] Disable submit during processing

### Accessibility
- [ ] Use semantic HTML
- [ ] Add proper labels to inputs
- [ ] Use proper button types
- [ ] Ensure keyboard navigation works

## ✅ API Integration

### Gemini API
- [ ] Use Gemini 1.5 Flash for document processing
- [ ] Upload PDFs to File API first
- [ ] Wait for ACTIVE state before generating content
- [ ] Use structured output prompts
- [ ] Parse JSON responses carefully
- [ ] Handle API errors gracefully

### Response Parsing
- [ ] Remove markdown code blocks from responses: `response.replace(/```json\n?/g, '')`
- [ ] Use try-catch when parsing JSON
- [ ] Validate response structure
- [ ] Provide fallback values

## ✅ Code Organization

### File Structure
- [ ] Components in `src/components/`
- [ ] Edge Functions in `supabase/functions/`
- [ ] Types in component files or separate `types/` folder
- [ ] Utilities in `src/lib/`

### Naming Conventions
- [ ] PascalCase for components: `SyllabusManager.tsx`
- [ ] camelCase for functions: `processWithAI()`
- [ ] UPPER_SNAKE_CASE for constants: `GEMINI_API_KEY`
- [ ] kebab-case for files: `extract-syllabus-chapters`

### Code Reuse
- [ ] Extract common logic to utility functions
- [ ] Create reusable components
- [ ] Use existing patterns from codebase
- [ ] Don't duplicate code

## ✅ Testing

### Before Committing
- [ ] Test the happy path
- [ ] Test error cases
- [ ] Test with empty/missing data
- [ ] Test as different user roles
- [ ] Check browser console for errors
- [ ] Check network tab for failed requests

### Edge Functions
- [ ] Test locally with `supabase functions serve`
- [ ] Check logs with `supabase functions logs`
- [ ] Test with actual files/data
- [ ] Verify CORS works from browser

## ✅ Deployment

### Pre-Deployment
- [ ] Run database migrations
- [ ] Deploy edge functions
- [ ] Verify environment variables
- [ ] Test in production-like environment

### Post-Deployment
- [ ] Check function logs
- [ ] Test with real users
- [ ] Monitor for errors
- [ ] Have rollback plan ready

## Common Patterns to Follow

### Edge Function Template
```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Your code here

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

### Component Template
```typescript
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface MyComponentProps {
  requiredProp: string;
  optionalProp?: number;
}

export function MyComponent({ requiredProp, optionalProp = 0 }: MyComponentProps) {
  const [data, setData] = useState<YourType[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('table').select('*');
      if (error) throw error;
      setData(data || []);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;

  return <div>{/* Your UI */}</div>;
}
```

---

## Quick Reference

**Always check this list before:**
1. Creating new Edge Functions → CORS checklist
2. Creating new components → TypeScript types
3. Database operations → RLS policies
4. File uploads → Storage policies
5. Deploying → Testing checklist

**When you see these errors:**
- CORS error → Check OPTIONS handler and headers
- Type error → Check interface definitions
- 401/403 error → Check RLS policies
- File upload fails → Check storage policies
- Edge function fails → Check environment variables
