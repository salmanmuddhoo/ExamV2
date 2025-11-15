# 🎯 Hints Configuration Guide (BEGINNER-FRIENDLY)

This file lists **ALL** the hints used in your application. You can easily edit the position, arrow alignment, and other settings here.

---

## 📖 How to Read This File

Each hint has these settings you can change:

- **Title**: The heading shown in the hint popup
- **Message**: The description text
- **Position**: Where the hint appears relative to the button/element
  - Options: `top`, `bottom`, `left`, `right`
- **Arrow Align**: Where the arrow points (only for top/bottom positions)
  - Options: `left`, `center`, `right`
- **Device**: Which devices show this hint
  - Options: `mobile`, `desktop`, `both`
- **Delay**: How long to wait before showing (in milliseconds, 1000 = 1 second)

---

## 🔧 How to Edit Hints

**TO CHANGE A HINT:** Find the hint section below, note the **File Location** and **Line Number**, then edit that file.

**EXAMPLE:**
```
If you want to change "Track Your Tokens" hint to point RIGHT instead of LEFT:
1. Find "Hint 2: Track Your Tokens" below
2. Note the file: src/components/ExamViewer.tsx (Line 1374)
3. Open that file and go to line 1374
4. Change: arrowAlign="left" → arrowAlign="right"
```

---

## 📱 MOBILE & DESKTOP DIFFERENCES

**IMPORTANT:** Some hints appear differently on mobile vs desktop because:
- Mobile screens are smaller, so positions need adjustment
- Desktop has more space for side-positioned hints
- Always test on both devices after making changes!

---

# 🎨 ALL HINTS IN THE APPLICATION

---

## 1️⃣ CHAT HUB PAGE

### Hint 1: New Conversation Button (MOBILE)
**Where it appears:** Chat Hub page - Plus (+) button at top right
**File Location:** `src/components/ChatHub.tsx` (Line 512-519)
**Device:** Mobile only

**Current Settings:**
```
Title: "Start Here!"
Message: "Tap here to select an exam paper and start practicing with AI assistance."
Position: bottom
Arrow Align: (not set - defaults to center)
Delay: 1000 (1 second)
```

**To Change Position:**
- Edit line 517: `position="bottom"`
- Try: `top`, `left`, `right`, or `bottom`

**To Change Arrow:**
- Add after position: `arrowAlign="left"` or `"right"` or `"center"`

---

### Hint 2: New Conversation Button (DESKTOP)
**Where it appears:** Chat Hub page - "New Conversation" button below title
**File Location:** `src/components/ChatHub.tsx` (Line 530-537)
**Device:** Desktop only

**Current Settings:**
```
Title: "Start Here!"
Message: "Click 'New Conversation' to select an exam paper and start practicing with AI assistance."
Position: bottom
Arrow Align: (not set - defaults to center)
Delay: 1000 (1 second)
```

**To Change Position:**
- Edit line 535: `position="bottom"`
- Try: `top`, `left`, `right`, or `bottom`

---

## 2️⃣ EXAM VIEWER PAGE (Year Practice Mode)

### Hint 3: Mobile Toggle Switch
**Where it appears:** Top of exam viewer on mobile - toggle between PDF and Chat
**File Location:** `src/components/ExamViewer.tsx` (Line 1160-1168)
**Device:** Mobile only

**Current Settings:**
```
Title: "Switch Views"
Message: "Toggle between exam paper and chat assistant. View the paper on the left, chat on the right!"
Position: bottom
Arrow Align: right
Delay: 1500 (1.5 seconds)
```

**To Change Position:**
- Edit line 1165: `position="bottom"`

**To Change Arrow:**
- Edit line 1166: `arrowAlign="right"`
- Try: `left`, `center`, or `right`

---

### Hint 4: Track Your Tokens
**Where it appears:** Above the chat input box - shows remaining AI tokens
**File Location:** `src/components/ExamViewer.tsx` (Line 1368-1376)
**Device:** Both mobile and desktop

**Current Settings:**
```
Title: "Track Your Tokens"
Message: "This shows your remaining AI tokens. Each question you ask uses tokens. Upgrade for more tokens!"
Position: top
Arrow Align: left  ← Points at the token counter on the left
Delay: 2000 (2 seconds)
```

**To Change Position:**
- Edit line 1373: `position="top"`

**To Change Arrow:**
- Edit line 1374: `arrowAlign="left"`
- **NOTE:** This is set to `left` to point at tokens (on the left side)
- If tokens move, update this to match!

---

### Hint 5: Chat Input Box
**Where it appears:** The text box where you type questions
**File Location:** `src/components/ExamViewer.tsx` (Line 1419-1426)
**Device:** Both mobile and desktop

**Current Settings:**
```
Title: "Ask Your Questions Here"
Message: "Type your question about the exam paper here. For example: 'Explain question 2' or 'Help me with Q3b'."
Position: top
Arrow Align: (not set - defaults to center)
Delay: 2000 (2 seconds)
```

**To Change Position:**
- Edit line 1424: `position="top"`

**To Change Arrow:**
- Add after position: `arrowAlign="center"` (or `left`/`right`)

---

## 3️⃣ UNIFIED PRACTICE VIEWER (Chapter Practice Mode)

### Hint 6: Mobile Toggle Switch (Chapter Mode)
**Where it appears:** Top of chapter practice viewer on mobile
**File Location:** `src/components/UnifiedPracticeViewer.tsx` (Line 960-968)
**Device:** Mobile only

**Current Settings:**
```
Title: "Switch Views"
Message: "Toggle between exam paper and chat assistant. View the paper on the left, chat on the right!"
Position: bottom
Arrow Align: right
Delay: 1500 (1.5 seconds)
```

---

### Hint 7: Track Your Tokens (Chapter Mode)
**Where it appears:** Above the chat input in chapter practice mode
**File Location:** `src/components/UnifiedPracticeViewer.tsx` (Line 1268-1276)
**Device:** Both mobile and desktop

**Current Settings:**
```
Title: "Track Your Tokens"
Message: "This shows your remaining AI tokens. Each question you ask uses tokens. Upgrade for more tokens!"
Position: top
Arrow Align: left
Delay: 2000 (2 seconds)
```

---

### Hint 8: Chat Input (Chapter Mode)
**Where it appears:** Chat input box in chapter practice mode
**File Location:** `src/components/UnifiedPracticeViewer.tsx` (Line 1321-1328)
**Device:** Both mobile and desktop

**Current Settings:**
```
Title: "Ask Your Questions Here"
Message: "Type your question about the practice questions here. The AI is here to help you understand!"
Position: top
Arrow Align: (not set - defaults to center)
Delay: 2000 (2 seconds)
```

---

## 4️⃣ STUDY PLAN PAGES

### Hint 9: Create Study Plan
**Where it appears:** Study plan wizard when creating a new plan
**File Location:** `src/components/StudyPlanWizard.tsx` (Line 759-766)
**Device:** Both mobile and desktop

**Current Settings:**
```
Title: "Create Your Study Plan"
Message: "Fill in your subject, grade, and preferences. Our AI will create a personalized study schedule just for you!"
Position: bottom
Arrow Align: left
Delay: (not set - shows immediately)
```

**To Change Position:**
- Edit line 764: `position="bottom"`

**To Change Arrow:**
- Edit line 765: `arrowAlign="left"`

---

### Hint 10: Calendar Task Viewing
**Where it appears:** Study plan calendar page - near the calendar title
**File Location:** `src/components/StudyPlanCalendar.tsx` (Line 1248-1255)
**Device:** Both mobile and desktop

**Current Settings:**
```
Title: "View Your Study Sessions"
Message: "Click on any study session to view details, mark it as in-progress, or complete it. Track your progress!"
Position: bottom
Arrow Align: left
Delay: (not set - shows immediately)
```

**To Change Position:**
- Edit line 1253: `position="bottom"`

**To Change Arrow:**
- Edit line 1254: `arrowAlign="left"`

---

### Hint 11: Mark Session Progress
**Where it appears:** Event detail modal - when viewing a study session
**File Location:** `src/components/EventDetailModal.tsx` (Line 537-544)
**Device:** Both mobile and desktop

**Current Settings:**
```
Title: "Track Your Progress"
Message: "Click these buttons to mark your session as 'In Progress' when you start studying, or 'Completed' when done!"
Position: bottom
Arrow Align: left
Delay: (not set - shows immediately)
```

**To Change Position:**
- Edit line 542: `position="bottom"`

**To Change Arrow:**
- Edit line 543: `arrowAlign="left"`

---

# 📋 QUICK REFERENCE TABLE

| Hint Name | Page | Mobile/Desktop | Position | Arrow | File & Line |
|-----------|------|----------------|----------|-------|-------------|
| New Conversation (Mobile) | Chat Hub | Mobile | bottom | center | ChatHub.tsx:517 |
| New Conversation (Desktop) | Chat Hub | Desktop | bottom | center | ChatHub.tsx:535 |
| Mobile Toggle (Year) | Exam Viewer | Mobile | bottom | right | ExamViewer.tsx:1165-1166 |
| Track Tokens (Year) | Exam Viewer | Both | top | left | ExamViewer.tsx:1373-1374 |
| Chat Input (Year) | Exam Viewer | Both | top | center | ExamViewer.tsx:1424 |
| Mobile Toggle (Chapter) | Unified Viewer | Mobile | bottom | right | UnifiedPracticeViewer.tsx:963-964 |
| Track Tokens (Chapter) | Unified Viewer | Both | top | left | UnifiedPracticeViewer.tsx:1272-1273 |
| Chat Input (Chapter) | Unified Viewer | Both | top | center | UnifiedPracticeViewer.tsx:1325 |
| Create Study Plan | Study Plan Wizard | Both | bottom | left | StudyPlanWizard.tsx:764-765 |
| Calendar Task View | Study Plan Calendar | Both | bottom | left | StudyPlanCalendar.tsx:1253-1254 |
| Mark Progress | Event Detail | Both | bottom | left | EventDetailModal.tsx:542-543 |

---

# 💡 TIPS FOR EDITING

1. **Always test on both mobile and desktop** after changing positions
2. **Arrow alignment only works with `top` or `bottom` positions**
3. **Use `left` arrow when pointing at left-side elements (like token counter)**
4. **Use `right` arrow when pointing at right-side elements (like toggle buttons)**
5. **Use `center` arrow for elements in the middle**
6. **Delay is in milliseconds:** 1000 = 1 second, 2000 = 2 seconds
7. **After editing, refresh your browser** to see changes

---

# 🚨 COMMON MISTAKES TO AVOID

❌ **Don't use arrow alignment with left/right positions** - it won't work!
❌ **Don't forget to add the delay property** if you want a delayed hint
❌ **Don't mix up mobile and desktop versions** - they're separate!
✅ **Always check the line numbers** - they might change if code is updated
✅ **Test your changes** before deploying to production

---

# 📞 NEED HELP?

If a hint isn't appearing correctly:
1. Check the device setting (mobile/desktop/both)
2. Verify the position and arrow alignment match the element location
3. Clear browser cache and reload
4. Check browser console for errors

---

**Last Updated:** 2025-11-15
**Total Hints:** 11 hints across 5 different pages
