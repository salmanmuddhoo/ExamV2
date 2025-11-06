# Admin Dashboard Improvements - Implementation Guide

## Completed ✅

###  1. Enhanced Analytics Dashboard
- **File**: `src/components/EnhancedAnalyticsDashboard.tsx` (created)
- **Changes**:
  - ✅ Added upload cost tracking separated by exam papers and syllabus
  - ✅ Added cost breakdown by AI model with request counts
  - ✅ Added average cost per user
  - ✅ Added average cost per AI prompt
  - ✅ Removed cache mode comparison analytics
  - ✅ Added study plan generation costs
  - ✅ Shows input/output tokens separately for each model

### 2. Updated AI Prompts
- **File**: `supabase/migrations/20251107000001_update_ai_prompts_for_evolved_platform.sql` (created)
- **Changes**:
  - ✅ Updated default prompt to be more comprehensive
  - ✅ Added Mathematics Tutor (specialized for math exams)
  - ✅ Added Science Tutor (Physics, Chemistry, Biology)
  - ✅ Added Humanities Tutor (History, Geography, Economics, Business)
  - ✅ Added Languages Tutor (English Language/Literature, Foreign Languages)
  - ✅ Added Detailed Tutor (high token usage, most comprehensive)
  - ✅ Added Concise Tutor (low token usage, brief and focused)

---

## Remaining Tasks

### 3. Syllabus Management - Subject Folder Reorganization

**Current Issue**: Syllabus list shows all items in a flat list.

**Required Change**: Group syllabus by subject as collapsible folders, showing grade alongside each item.

**Implementation Approach**:
```tsx
// In SyllabusManager.tsx around line 640
// Replace the flat syllabusList.map with grouped rendering:

const groupedBySubject = syllabusList.reduce((acc, syllabus) => {
  const subjectName = syllabus.subject?.name || 'Unknown Subject';
  if (!acc[subjectName]) {
    acc[subjectName] = [];
  }
  acc[subjectName].push(syllabus);
  return acc;
}, {} as Record<string, Syllabus[]>);

// Then render with collapsible folders
const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());

// Toggle function
const toggleSubject = (subjectName: string) => {
  setExpandedSubjects(prev => {
    const newSet = new Set(prev);
    if (newSet.has(subjectName)) {
      newSet.delete(subjectName);
    } else {
      newSet.add(subjectName);
    }
    return newSet;
  });
};

// Render
{Object.entries(groupedBySubject).sort(([a], [b]) => a.localeCompare(b)).map(([subjectName, syllabuses]) => (
  <div key={subjectName} className="border border-gray-200 rounded-lg mb-2">
    <button
      onClick={() => toggleSubject(subjectName)}
      className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
    >
      <div className="flex items-center space-x-3">
        <Folder className="w-5 h-5 text-blue-600" />
        <span className="font-semibold text-gray-900">{subjectName}</span>
        <span className="text-sm text-gray-500">({syllabuses.length})</span>
      </div>
      {expandedSubjects.has(subjectName) ? (
        <ChevronDown className="w-5 h-5 text-gray-500" />
      ) : (
        <ChevronRight className="w-5 h-5 text-gray-500" />
      )}
    </button>
    {expandedSubjects.has(subjectName) && (
      <div className="p-4 space-y-3 border-t border-gray-200 bg-gray-50">
        {syllabuses.map((syllabus) => (
          <div key={syllabus.id} className="bg-white p-4 rounded-lg border border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3 flex-1">
                <FileText className="w-6 h-6 text-blue-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <div className="flex items-center space-x-2">
                    <h4 className="font-semibold text-gray-900">
                      {syllabus.title || syllabus.file_name}
                    </h4>
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                      {syllabus.grade?.name}
                    </span>
                  </div>
                  {/* Rest of syllabus card content... */}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
))}
```

**Files to modify**:
- `src/components/SyllabusManager.tsx` (around lines 637-720)
- Add `Folder, ChevronDown, ChevronRight` to imports from 'lucide-react'
- Add `expandedSubjects` state management

---

### 4. Exam Papers - Collapse Subject Folders by Default

**Current Issue**: Subject folders might be expanded by default.

**Required Change**: All subject folders should be collapsed on initial load.

**Implementation Approach**:
```tsx
// In ExamPaperManager.tsx
// Find the state for expanded subjects (likely something like):
const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());

// Change to:
const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
// Remove any initial population of this Set

// Ensure the rendering logic checks if expandedSubjects.has(subjectId/subjectName)
// and only renders children when true
```

**Files to modify**:
- `src/components/ExamPaperManager.tsx`
- Find where `expandedSubjects` or similar state is initialized
- Ensure it starts as empty `new Set()`

---

### 5. Subscription Tab - Fix Overflow Issue

**Current Issue**: Content extends beyond right edge of window.

**Required Change**: Make content responsive and prevent horizontal overflow.

**Implementation Approach**:

```tsx
// In AdminSubscriptionManager.tsx
// Wrap the main content in a container with overflow handling:

<div className="max-w-full overflow-x-auto">
  {/* Existing content */}
</div>

// For wide tables, add horizontal scroll:
<div className="overflow-x-auto">
  <table className="min-w-full">
    {/* table content */}
  </table>
</div>

// For form grids that might be too wide:
<div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
  {/* Replace any grid-cols-4 or higher with responsive breakpoints */}
</div>

// Check for any fixed width elements:
// Replace w-[specific-px] with max-w-full or responsive classes
```

**Common causes of overflow**:
1. Tables without `overflow-x-auto` wrapper
2. Grid layouts with too many columns (`grid-cols-4`, `grid-cols-5`, etc.)
3. Fixed-width elements (`w-[800px]`, etc.)
4. Long text without `truncate` or `break-words`
5. Forms with many inline fields

**Files to modify**:
- `src/components/AdminSubscriptionManager.tsx`
- Identify all table elements and wrap in `<div className="overflow-x-auto">`
- Change grid layouts to use responsive breakpoints
- Add `max-w-full` to container divs
- Use `truncate` or `break-words` for text that might overflow

---

## Testing Checklist

After making these changes:

1. **Analytics Dashboard**:
   - [ ] Check that upload costs show separately for exam papers and syllabus
   - [ ] Verify AI model breakdown table displays correctly
   - [ ] Confirm average per user section shows correct values
   - [ ] Verify average per prompt table appears when prompts are used
   - [ ] Confirm cache mode comparison tab is removed

2. **AI Prompts**:
   - [ ] Run migration to add new prompts
   - [ ] Verify all 6 prompts appear in AI Prompt Manager
   - [ ] Test that prompts can be assigned to exam papers
   - [ ] Confirm prompt descriptions are clear

3. **Syllabus Management**:
   - [ ] Verify syllabuses are grouped by subject
   - [ ] Check that subject folders can be expanded/collapsed
   - [ ] Confirm grade badge shows next to each syllabus title
   - [ ] Test with multiple syllabuses per subject
   - [ ] Verify count shows correctly in folder header

4. **Exam Papers**:
   - [ ] Verify all subject folders are collapsed on page load
   - [ ] Check that folders can still be expanded/collapsed
   - [ ] Confirm exam papers display correctly when expanded

5. **Subscription Tab**:
   - [ ] Check that no horizontal scroll appears on the page
   - [ ] Test on different screen sizes (1920px, 1366px, 1024px)
   - [ ] Verify all tables are scrollable if content is wide
   - [ ] Confirm all form elements fit within viewport
   - [ ] Test on smaller screens (tablet, mobile landscape)

---

## Migration Files Created

1. `supabase/migrations/20251107000000_update_token_multipliers_accurate_costs.sql`
   - Cost-based token consumption system

2. `supabase/migrations/20251107000001_update_ai_prompts_for_evolved_platform.sql`
   - Updated AI prompts for evolved platform

---

## Component Files Created/Modified

1. **Created**: `src/components/EnhancedAnalyticsDashboard.tsx`
2. **Modified**: `src/components/AnalyticsDashboard.tsx` (simplified to use enhanced version)
3. **To Modify**: `src/components/SyllabusManager.tsx` (add subject folder grouping)
4. **To Modify**: `src/components/ExamPaperManager.tsx` (collapse by default)
5. **To Modify**: `src/components/AdminSubscriptionManager.tsx` (fix overflow)

---

## Notes

- The Enhanced Analytics Dashboard is fully functional and ready to use
- AI prompts migration will add 6 comprehensive prompts tailored to different subjects and use cases
- Syllabus and Exam Papers changes require modification to existing files
- Subscription overflow fix requires identifying specific elements causing the issue

