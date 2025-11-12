# Hint Tutorial System - User Guide

## Overview

The Hint Tutorial System provides an interactive, step-by-step guide for first-time users. Hints are configurable via a markdown file and can be positioned relative to any UI element.

## Features

- ✅ Configurable hints via markdown file
- ✅ Responsive positioning (works on mobile and desktop)
- ✅ Progress tracking with localStorage
- ✅ Automatic display for new users (< 24 hours old)
- ✅ Skip/close functionality
- ✅ Visual highlighting of target elements
- ✅ Page-specific hints
- ✅ Device-specific hints (mobile/desktop/both)

## File Structure

```
src/
├── components/
│   ├── HintTooltip.tsx           # Individual hint display component
│   └── HintTutorialManager.tsx   # Manager component (handles when to show hints)
├── contexts/
│   └── HintTutorialContext.tsx   # State management and hint logic
├── types/
│   └── hints.ts                  # TypeScript interfaces
├── utils/
│   └── hintParser.ts             # Markdown parser for hints config
└── styles/
    └── hints.css                 # Hint styling and animations

docs/
├── hints-config.md               # MAIN CONFIGURATION FILE - Edit this!
└── HINT_TUTORIAL_README.md       # This file
```

## Quick Start

### 1. Setup (Already Done)

The hint system is already integrated. To enable it in your app:

1. Import the HintTutorialProvider in your main App component:
   ```tsx
   import { HintTutorialProvider } from './contexts/HintTutorialContext';
   import { HintTutorialManager } from './components/HintTutorialManager';
   import './styles/hints.css';
   ```

2. Wrap your app:
   ```tsx
   <HintTutorialProvider>
     <YourApp />
     <HintTutorialManager />
   </HintTutorialProvider>
   ```

### 2. Add data-hint Attributes to Your Components

For hints to work, you need to add `data-hint` attributes to target elements:

```tsx
// Example: Upload button
<button data-hint="upload-button" onClick={handleUpload}>
  Upload Exam Paper
</button>

// Example: Study plan section
<div data-hint="today-study-plan">
  <h2>Today's Study Plan</h2>
  {/* content */}
</div>

// Example: Chat input
<textarea data-hint="chat-input" placeholder="Ask a question..." />
```

### 3. Configure Hints

Edit `/docs/hints-config.md` to add or modify hints.

## Hint Configuration Format

Each hint in `hints-config.md` follows this format:

```markdown
### Hint X: Hint Name
- **ID**: unique-hint-id
- **Title**: Hint Title
- **Description**: What the user will see
- **Target**: [data-hint="element-id"] or body
- **Position**: top | bottom | left | right | center
- **OffsetX**: 0
- **OffsetY**: 10
- **Page**: /chat | /study-plan | /profile | /admin
- **Order**: 1
- **ShowOn**: both | desktop | mobile
```

### Property Descriptions

| Property | Description | Example Values |
|----------|-------------|----------------|
| **ID** | Unique identifier for the hint | `chat-welcome`, `study-plan-create` |
| **Title** | Bold title shown in hint | `"Welcome to Aixampapers!"` |
| **Description** | Main explanation text | `"Let's take a quick tour..."` |
| **Target** | CSS selector for element to highlight | `[data-hint="upload-button"]`, `body` |
| **Position** | Where to place hint relative to target | `top`, `bottom`, `left`, `right`, `center` |
| **OffsetX** | Horizontal adjustment in pixels | `-10`, `0`, `20` |
| **OffsetY** | Vertical adjustment in pixels | `-10`, `0`, `10` |
| **Page** | Which page this hint appears on | `/chat`, `/study-plan`, `/profile` |
| **Order** | Display sequence (1, 2, 3...) | `1`, `2`, `3` |
| **ShowOn** | Device types to show on | `both`, `desktop`, `mobile` |

## Adding New Hints

### Step 1: Add data-hint attribute

Add the attribute to your target element in the component:

```tsx
<button
  data-hint="new-feature-button"
  onClick={handleNewFeature}
>
  Try New Feature
</button>
```

### Step 2: Add hint to configuration

Edit `/docs/hints-config.md` and add:

```markdown
### Hint 5: New Feature
- **ID**: chat-new-feature
- **Title**: Try Our New Feature
- **Description**: Click here to explore our new feature that helps you study more effectively.
- **Target**: [data-hint="new-feature-button"]
- **Position**: bottom
- **OffsetX**: 0
- **OffsetY**: 10
- **Page**: /chat
- **Order**: 5
- **ShowOn**: both
```

### Step 3: Update HintTutorialContext.tsx

Open `/src/contexts/HintTutorialContext.tsx` and add the new hint to the `HINTS_CONFIG` constant (copy from your markdown file).

**Note:** In a production setup, you might want to fetch this from an API or import it dynamically.

## Positioning Guide

### Position Examples

```
┌─────────────┐
│    top      │
│  ┌───────┐  │
│  │Target │  │
│  └───────┘  │
│   bottom    │
└─────────────┘

left ← [Target] → right
```

### Offset Examples

- `OffsetX: 10` - Move hint 10px to the right
- `OffsetX: -10` - Move hint 10px to the left
- `OffsetY: 10` - Move hint 10px down
- `OffsetY: -10` - Move hint 10px up

## Usage Patterns

### Welcome Message (Centered)

```markdown
### Hint 1: Welcome
- **Target**: body
- **Position**: center
- **Page**: /chat
- **Order**: 1
```

### Point to Specific Button

```markdown
### Hint 2: Upload
- **Target**: [data-hint="upload-button"]
- **Position**: bottom
- **OffsetY**: 10
- **Page**: /chat
- **Order**: 2
```

### Desktop-Only Hint

```markdown
### Hint 3: Sidebar Feature
- **Target**: [data-hint="sidebar-item"]
- **Position**: right
- **Page**: /dashboard
- **ShowOn**: desktop
```

### Mobile-Only Hint

```markdown
### Hint 4: Mobile Menu
- **Target**: [data-hint="mobile-menu"]
- **Position**: bottom
- **Page**: /dashboard
- **ShowOn**: mobile
```

## Programmatic Control

### Manually Start Tutorial

```tsx
import { useHintTutorial } from './contexts/HintTutorialContext';

function MyComponent() {
  const { startTutorial } = useHintTutorial();

  const handleShowTutorial = () => {
    startTutorial('/chat'); // Start hints for /chat page
  };

  return (
    <button onClick={handleShowTutorial}>
      Show Tutorial
    </button>
  );
}
```

### Reset Tutorial Progress

```tsx
const { resetTutorial } = useHintTutorial();

<button onClick={resetTutorial}>
  Reset Tutorial
</button>
```

### Check Tutorial Status

```tsx
const { progress } = useHintTutorial();

console.log('Completed:', progress.tutorialCompleted);
console.log('Seen hints:', progress.seenHints);
```

## Styling Customization

Edit `/src/styles/hints.css` to customize:

- Highlight color and animation
- Tooltip appearance
- Responsive breakpoints

```css
/* Change highlight color */
.hint-highlight {
  box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.5) !important;
  /* Change rgba values for different color */
}

/* Change animation speed */
@keyframes hint-pulse {
  /* Modify animation here */
}
```

## Testing

### Test Specific Hints

1. Clear localStorage: `localStorage.removeItem('hint-tutorial-progress')`
2. Refresh page
3. Hints will show for the current page

### Test as New User

The system only shows hints to users whose account is < 24 hours old. To test:

1. Create a new test account
2. Or modify the check in `HintTutorialManager.tsx` temporarily

### Debug Mode

Add to `HintTutorialManager.tsx`:

```tsx
useEffect(() => {
  console.log('Current hints:', currentHints);
  console.log('Progress:', progress);
  console.log('Is showing:', isShowingHints);
}, [currentHints, progress, isShowingHints]);
```

## Best Practices

### DO ✅

- Keep hints concise (1-2 sentences)
- Use action-oriented language ("Click here to...")
- Order hints logically (follow user flow)
- Test on both mobile and desktop
- Use specific `data-hint` attributes
- Group hints by page/feature

### DON'T ❌

- Create too many hints (max 5-7 per page)
- Use vague descriptions
- Point to elements that might not exist
- Forget to add `data-hint` attributes
- Use complex CSS selectors as targets

## Troubleshooting

### Hint Not Showing

1. **Check target exists:** Open dev tools and search for `data-hint="your-target"`
2. **Check page match:** Verify `Page` property matches current route
3. **Check device:** Verify `ShowOn` matches your device type
4. **Check progress:** Clear localStorage to reset tutorial

### Positioning Issues

1. **Try different position:** Use `center` if element positioning is tricky
2. **Adjust offsets:** Increase `OffsetX` or `OffsetY` values
3. **Check viewport:** Some positions work better on mobile vs desktop

### Hint Not Parsing

1. **Check markdown syntax:** Ensure each property follows `- **Property**: value` format
2. **Check required fields:** All hints need ID, Title, Description, Target, Position, Page
3. **Check update:** Verify `HINTS_CONFIG` in Context file matches your markdown

## Advanced: Dynamic Hints from API

To load hints from an API instead of hardcoded config:

```tsx
// In HintTutorialContext.tsx
useEffect(() => {
  async function loadHints() {
    const response = await fetch('/api/hints-config');
    const markdown = await response.text();
    const parsedHints = parseHintsConfig(markdown);
    setHints(parsedHints);
  }
  loadHints();
}, []);
```

## Support

For issues or questions:
1. Check this README
2. Review example hints in `hints-config.md`
3. Check browser console for errors
4. Verify `data-hint` attributes are correct

## Version History

- **v1.0.0** - Initial hint tutorial system
  - Basic hint display
  - Progress tracking
  - Mobile/desktop support
  - Markdown configuration
