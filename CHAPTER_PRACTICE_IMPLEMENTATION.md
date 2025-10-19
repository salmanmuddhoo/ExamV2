# Chapter-Based Practice Mode - Implementation Guide

## Overview

A new practice mode has been implemented that allows students to practice exam questions organized by syllabus chapters. Students can swipe through questions, view them one at a time, and use the AI assistant to ask questions about each specific problem.

## Features Implemented

### 1. ChapterPractice Component (`src/components/ChapterPractice.tsx`)

**Features:**
- ✅ Subject and grade level selection
- ✅ Chapter selection (only chapters with questions)
- ✅ Question carousel with next/previous navigation
- ✅ Mobile swipe support for question navigation
- ✅ AI chat assistant panel (toggle on/off)
- ✅ Automatic question detection when navigating
- ✅ Questions sorted by year (most recent first)
- ✅ Responsive design for mobile and desktop

**How it works:**
1. Student selects subject → grade → chapter
2. All questions tagged to that chapter load
3. Student can navigate through questions using:
   - Previous/Next buttons
   - Swipe gestures (mobile)
4. AI assistant automatically focuses on current question
5. Chat history resets when changing questions

### 2. Database Schema (`supabase/migrations/20251021000001_create_chapter_conversations.sql`)

**New Tables:**

**chapter_conversations:**
- Stores conversation sessions for chapter practice
- Links to user, chapter, and creation date
- RLS enabled for user privacy

**chapter_messages:**
- Stores individual messages in conversations
- Links to conversation and optionally to specific question
- Tracks role (user/assistant) and content

**Features:**
- Auto-updates conversation timestamp on new message
- Row Level Security for data privacy
- Indexes for fast queries

### 3. App Integration

**Modified `src/App.tsx`:**
- Added 'chapter-practice' view type
- Created `handleNavigateToChapterPractice()` handler
- Added view routing for ChapterPractice component
- Integrated with subscription modal

## User Experience

### Desktop Flow:
```
1. Student opens ChatHub
2. Clicks "Practice by Chapter" button (TO BE ADDED)
3. Selects Subject → Grade → Chapter
4. Views questions in main area
5. Clicks "AI Assistant" button to show chat panel
6. Panel appears on right side (1/3 width)
7. Student asks questions about current problem
8. Uses Previous/Next buttons to navigate
```

### Mobile Flow:
```
1. Student opens ChatHub
2. Clicks "Practice by Chapter" button (TO BE ADDED)
3. Selects Subject → Grade → Chapter
4. Views questions in full screen
5. Swipes left/right to navigate between questions
6. Taps "AI Assistant" button
7. Chat overlay appears (full screen)
8. Student asks questions
9. Closes chat to return to question view
```

## Implementation Status

### ✅ Completed:
- [x] ChapterPractice component with full UI
- [x] Mobile swipe navigation
- [x] AI chat assistant integration
- [x] Database migrations
- [x] App.tsx routing
- [x] Question sorting by year
- [x] Responsive design

### 🔄 In Progress:
- [ ] Add "Practice by Chapter" button in ChatHub
- [ ] Connect to chat assistant edge function
- [ ] Test AI responses with chapter context

### 📝 To Do:
- [ ] Update/create edge function for chapter-based chat
- [ ] Add progress tracking (questions attempted)
- [ ] Add bookmarking favorite questions
- [ ] Add filtering (by year, difficulty)
- [ ] Add practice statistics

## Edge Function Requirements

The component expects an edge function at:
```
/functions/v1/chat-with-assistant
```

**Expected Request Body:**
```typescript
{
  conversationId: string,
  message: string,
  questionImages: string[],  // Array of image URLs
  questionText: string,      // OCR text
  context: {
    type: 'chapter',
    chapterId: string,
    questionNumber: string,
    examTitle: string
  }
}
```

**Expected Response:**
```typescript
{
  response: string  // AI assistant's reply
}
```

## Navigation Integration (Next Step)

To add the "Practice by Chapter" button in ChatHub:

1. Update `ChatHub.tsx` props to include `onNavigateChapterPractice`:
```typescript
interface Props {
  // ... existing props
  onNavigateChapterPractice?: () => void;
}
```

2. Add button in the sidebar:
```tsx
<button
  onClick={() => onNavigateChapterPractice?.()}
  className="w-full px-4 py-2.5 bg-white border-2 border-black text-black rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center space-x-2 mb-2"
>
  <BookOpen className="w-4 h-4" />
  <span>Practice by Chapter</span>
</button>
```

3. Update App.tsx ChatHub call:
```tsx
<ChatHub
  // ... existing props
  onNavigateChapterPractice={handleNavigateToChapterPractice}
/>
```

## Mobile Considerations

### Swipe Detection:
- Minimum swipe distance: 50px
- Swipe left = next question
- Swipe right = previous question
- Only works when chat is closed

### Chat Overlay:
- Full screen on mobile (z-index: 50)
- Fixed positioning
- Slides over question view
- Easy close button (top right)

### Touch Optimization:
- Large touch targets (min 44px)
- Smooth scroll behavior
- Disabled swipe when input focused

## Deployment Steps

1. **Apply Database Migration:**
```bash
supabase db push
```

2. **Deploy Frontend:**
```bash
npm run build
# Deploy dist/ folder
```

3. **Create/Update Edge Function:**
```bash
# Create or update chat-with-assistant function
supabase functions deploy chat-with-assistant
```

4. **Test Flow:**
- Select subject → grade → chapter
- Navigate between questions
- Open chat assistant
- Send a message
- Verify AI response
- Test on mobile device

## Benefits

### For Students:
- **Focused Practice:** Practice specific chapters where they're weak
- **Organized Learning:** All questions on a topic in one place
- **Immediate Help:** AI assistant available for every question
- **Mobile Friendly:** Practice anywhere, anytime
- **Progressive:** See all past year questions on a topic

### For Learning:
- **Topic Mastery:** Deep practice on specific concepts
- **Pattern Recognition:** See how questions evolve over years
- **Adaptive:** Students can focus on challenging areas
- **Efficient:** No need to search through entire papers

## Example Usage

**Student struggling with "Algebra - Quadratic Equations":**

1. Opens Chapter Practice
2. Selects: Math → Grade 10 → Chapter 3: Quadratic Equations
3. Sees 15 questions from past 5 years
4. Starts with 2024 question
5. Tries to solve it
6. Stuck on part (b)
7. Opens AI assistant
8. Asks: "How do I factor this equation?"
9. Gets step-by-step guidance
10. Swipes to next question
11. Continues practicing

## Technical Notes

### Question Detection:
- Current question tracked by index
- Changes when user clicks Previous/Next or swipes
- Chat history cleared on question change
- New conversation started if needed

### Image Loading:
- Questions can have multiple images
- All images for current question displayed
- Images passed to AI for context

### State Management:
- Local component state (no global state)
- Conversation ID persisted per question
- Messages reset when changing questions
- Selection state preserved on navigation

## Future Enhancements

1. **Progress Tracking**
   - Mark questions as attempted/mastered
   - Show completion percentage per chapter
   - Track time spent on each question

2. **Smart Recommendations**
   - Suggest next chapter to practice
   - Identify weak areas
   - Recommend similar questions

3. **Social Features**
   - Share questions with study group
   - See most attempted questions
   - Community hints/tips

4. **Practice Modes**
   - Timed practice
   - Quiz mode
   - Flashcard mode for quick review

5. **Offline Support**
   - Download questions for offline practice
   - Sync progress when online

## Support

For issues:
1. Check database migration is applied
2. Verify edge function is deployed
3. Check browser console for errors
4. Test on different devices/browsers
