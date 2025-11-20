-- Add AI prompt support to syllabus table
-- Allows admins to customize the AI extraction prompt for different subject syllabuses

-- Add ai_prompt_id column to syllabus table
ALTER TABLE syllabus
ADD COLUMN IF NOT EXISTS ai_prompt_id UUID REFERENCES ai_prompts(id) ON DELETE SET NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_syllabus_ai_prompt ON syllabus(ai_prompt_id);

-- Add comment
COMMENT ON COLUMN syllabus.ai_prompt_id IS 'Reference to the AI prompt to use for chapter extraction. If NULL, uses default extraction prompt.';

-- Insert a default syllabus extraction prompt
INSERT INTO ai_prompts (name, description, system_prompt)
VALUES (
  'Default Syllabus Extraction',
  'General-purpose syllabus chapter extraction for all subjects',
  'Analyze this syllabus PDF and intelligently extract all chapters with their hierarchical structure.

ANALYSIS INSTRUCTIONS:
1. Identify the main content section (often called "Subject content", "Course content", "Syllabus content", etc.)
2. Recognize the chapter numbering system used (could be 1, 2, 3... or A, B, C... or I, II, III... or Chapter 1, Chapter 2, etc.)
3. Identify subtopics - these are typically numbered as decimals (1.1, 1.2) or letters (1a, 1b) or roman numerals (i, ii, iii)
4. Do NOT create artificial hierarchy - extract only what''s explicitly structured in the document
5. Ignore introductory sections like "Why choose this syllabus", "Assessment overview", "How to use this syllabus", etc.

CHAPTER IDENTIFICATION RULES:
- A chapter is a MAJOR section with a main heading/title
- Each chapter must have a clear chapter number/identifier
- Chapters are typically separated by visible section breaks, page breaks, or major formatting changes
- Subtopics are SMALLER subdivisions within a chapter (like 1.1, 1.2, 1.3 or a, b, c)
- Maintain the exact numbering system from the document

OUTPUT FORMAT:
Return a valid JSON object with this exact structure:
{
  "chapters": [
    {
      "chapterNumber": "1",
      "title": "Chapter title exactly as written",
      "description": "Brief description if available, otherwise empty string",
      "subtopics": [
        "1.1 Subtopic title",
        "1.2 Another subtopic"
      ],
      "confidence": 0.95
    },
    {
      "chapterNumber": "2",
      "title": "Second chapter title",
      "description": "",
      "subtopics": [
        "2.1 Subtopic title",
        "2.2 Another subtopic"
      ],
      "confidence": 0.90
    }
  ],
  "metadata": {
    "total_chapters": 10,
    "subject": "Subject name if identifiable from the document",
    "level": "O Level, A Level, IGCSE, etc. if identifiable",
    "syllabus_code": "Code if visible (e.g., 2210, 9618, etc.)",
    "numbering_system": "Description of how chapters are numbered (e.g., ''Sequential numbers 1-10'', ''Letters A-F'', etc.)",
    "notes": "Any important observations about the structure or extraction"
  }
}

QUALITY REQUIREMENTS:
- Set confidence between 0-1 based on clarity of chapter boundaries
- If subtopics aren''t clearly defined, use empty array []
- Maintain the EXACT numbering from the document (don''t renumber)
- Extract ALL main chapters from the content section
- Be precise with titles - use exact text from the document
- If uncertain about chapter boundaries, note this in confidence score and metadata

IMPORTANT: Focus on extracting the actual teaching/learning content structure, not administrative sections. Look for the section that contains the actual subject matter to be taught.'
)
ON CONFLICT (name) DO NOTHING;
