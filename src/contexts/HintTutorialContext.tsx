import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Hint, HintProgress } from '../types/hints';
import { parseHintsConfig, getHintsForPage } from '../utils/hintParser';

// Import hints config - you'll need to create this as a raw string or fetch it
const HINTS_CONFIG = `# Hint Tutorial Configuration

## Chat Hub Hints

### Hint 1: Welcome
- **ID**: chat-welcome
- **Title**: Welcome to Aixampapers!
- **Description**: Let's take a quick tour of the main features to help you get started.
- **Target**: body
- **Position**: center
- **OffsetX**: 0
- **OffsetY**: 0
- **Page**: chat-hub
- **Order**: 1
- **ShowOn**: both

### Hint 2: Upload Exam Papers
- **ID**: chat-upload
- **Title**: Upload Your Exam Papers
- **Description**: Click here to upload exam papers. You can upload PDF files or images of your exams.
- **Target**: [data-hint="upload-button"]
- **Position**: bottom
- **OffsetX**: 0
- **OffsetY**: 10
- **Page**: chat-hub
- **Order**: 2
- **ShowOn**: both

### Hint 3: Today's Study Plan
- **ID**: chat-study-plan
- **Title**: Today's Study Sessions
- **Description**: View your scheduled study sessions for today. Click on any session to see details or mark it as complete.
- **Target**: [data-hint="today-study-plan"]
- **Position**: left
- **OffsetX**: -10
- **OffsetY**: 0
- **Page**: chat-hub
- **Order**: 3
- **ShowOn**: desktop

### Hint 4: AI Assistant
- **ID**: chat-assistant
- **Title**: AI-Powered Help
- **Description**: Ask questions about any topic and get instant explanations. You can also ask for practice questions or study tips.
- **Target**: [data-hint="chat-input"]
- **Position**: top
- **OffsetX**: 0
- **OffsetY**: -10
- **Page**: chat-hub
- **Order**: 4
- **ShowOn**: desktop

### Hint 5: New Conversation (Mobile)
- **ID**: chat-new-conversation-mobile
- **Title**: Start a New Chat
- **Description**: Tap here to start a new conversation with the AI assistant.
- **Target**: [data-hint="new-conversation-button"]
- **Position**: right
- **OffsetX**: 10
- **OffsetY**: 0
- **Page**: chat-hub
- **Order**: 5
- **ShowOn**: mobile

### Hint 6: Question Input (Mobile)
- **ID**: chat-input-mobile
- **Title**: Ask Your Question
- **Description**: Type your question here and the AI will help you understand any topic or concept.
- **Target**: [data-hint="chat-input"]
- **Position**: top
- **OffsetX**: 0
- **OffsetY**: -10
- **Page**: chat-hub
- **Order**: 6
- **ShowOn**: mobile

### Hint 7: Token Balance
- **ID**: chat-token-balance
- **Title**: Your Token Balance
- **Description**: Keep track of your remaining tokens here. Each question uses tokens based on the AI model you've selected.
- **Target**: [data-hint="token-display"]
- **Position**: bottom
- **OffsetX**: 0
- **OffsetY**: 10
- **Page**: chat-hub
- **Order**: 7
- **ShowOn**: both

## Exam Viewer Hints

### Hint 8: Exam/Chat Toggle (Year Mode)
- **ID**: exam-toggle
- **Title**: Switch Between Views
- **Description**: Toggle between viewing your exam paper and chatting with the AI assistant for help.
- **Target**: [data-hint="exam-chat-toggle"]
- **Position**: bottom
- **OffsetX**: 0
- **OffsetY**: 10
- **Page**: exam-viewer
- **Order**: 1
- **ShowOn**: mobile

### Hint 9: Exam/Chat Toggle (Chapter Mode)
- **ID**: unified-toggle
- **Title**: Switch Between Views
- **Description**: Toggle between viewing practice questions and chatting with the AI assistant for help.
- **Target**: [data-hint="exam-chat-toggle"]
- **Position**: bottom
- **OffsetX**: 0
- **OffsetY**: 10
- **Page**: unified-viewer
- **Order**: 1
- **ShowOn**: mobile

## Study Plan Hints

### Hint 10: Create Study Plan
- **ID**: study-plan-create
- **Title**: Create Your Study Plan
- **Description**: Click here to create a personalized study plan. Choose your subjects, grade level, and study schedule.
- **Target**: [data-hint="create-plan-button"]
- **Position**: bottom
- **OffsetX**: 0
- **OffsetY**: 10
- **Page**: study-plan
- **Order**: 1
- **ShowOn**: both

### Hint 11: Calendar View
- **ID**: study-plan-calendar
- **Title**: Your Study Calendar
- **Description**: View all your study sessions in calendar format. Click on any session to view details or update its status.
- **Target**: [data-hint="calendar-view"]
- **Position**: top
- **OffsetX**: 0
- **OffsetY**: -10
- **Page**: study-plan
- **Order**: 2
- **ShowOn**: both
`;

interface HintTutorialContextType {
  hints: Hint[];
  currentHints: Hint[];
  currentHintIndex: number;
  isShowingHints: boolean;
  progress: HintProgress;
  currentView: string;
  setCurrentView: (view: string) => void;
  startTutorial: (page: string) => void;
  nextHint: () => void;
  previousHint: () => void;
  skipTutorial: () => void;
  closeTutorial: () => void;
  resetTutorial: () => void;
}

const HintTutorialContext = createContext<HintTutorialContextType | undefined>(undefined);

const STORAGE_KEY = 'hint-tutorial-progress';

export function HintTutorialProvider({ children }: { children: ReactNode }) {
  const [hints, setHints] = useState<Hint[]>([]);
  const [currentHints, setCurrentHints] = useState<Hint[]>([]);
  const [currentHintIndex, setCurrentHintIndex] = useState(0);
  const [isShowingHints, setIsShowingHints] = useState(false);
  const [currentView, setCurrentView] = useState('');
  const [progress, setProgress] = useState<HintProgress>({
    seenHints: [],
    currentHintIndex: 0,
    tutorialCompleted: false,
    lastShownDate: ''
  });
  const [isMobile, setIsMobile] = useState(false);

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load hints config
  useEffect(() => {
    const parsedHints = parseHintsConfig(HINTS_CONFIG);
    setHints(parsedHints);
  }, []);

  // Load progress from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setProgress(JSON.parse(stored));
      } catch (error) {
        console.error('Error loading hint progress:', error);
      }
    }
  }, []);

  // Save progress to localStorage
  const saveProgress = (newProgress: HintProgress) => {
    setProgress(newProgress);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newProgress));
  };

  const startTutorial = (page: string) => {
    const pageHints = getHintsForPage(hints, page, isMobile);

    if (pageHints.length === 0) {
      console.log('No hints available for page:', page);
      return;
    }

    // Filter out already seen hints unless tutorial is reset
    const unseenHints = progress.tutorialCompleted
      ? pageHints
      : pageHints.filter(hint => !progress.seenHints.includes(hint.id));

    if (unseenHints.length === 0 && !progress.tutorialCompleted) {
      console.log('All hints for this page have been seen');
      return;
    }

    setCurrentHints(unseenHints.length > 0 ? unseenHints : pageHints);
    setCurrentHintIndex(0);
    setIsShowingHints(true);
  };

  const nextHint = () => {
    if (currentHintIndex < currentHints.length - 1) {
      // Mark current hint as seen
      const currentHint = currentHints[currentHintIndex];
      if (!progress.seenHints.includes(currentHint.id)) {
        saveProgress({
          ...progress,
          seenHints: [...progress.seenHints, currentHint.id],
          currentHintIndex: currentHintIndex + 1
        });
      }

      setCurrentHintIndex(currentHintIndex + 1);
    } else {
      // Last hint - mark tutorial as completed
      const currentHint = currentHints[currentHintIndex];
      saveProgress({
        ...progress,
        seenHints: [...progress.seenHints, currentHint.id],
        tutorialCompleted: true,
        lastShownDate: new Date().toISOString()
      });
      setIsShowingHints(false);
    }
  };

  const previousHint = () => {
    if (currentHintIndex > 0) {
      setCurrentHintIndex(currentHintIndex - 1);
    }
  };

  const skipTutorial = () => {
    saveProgress({
      ...progress,
      tutorialCompleted: true,
      lastShownDate: new Date().toISOString()
    });
    setIsShowingHints(false);
  };

  const closeTutorial = () => {
    setIsShowingHints(false);
  };

  const resetTutorial = () => {
    saveProgress({
      seenHints: [],
      currentHintIndex: 0,
      tutorialCompleted: false,
      lastShownDate: ''
    });
  };

  return (
    <HintTutorialContext.Provider
      value={{
        hints,
        currentHints,
        currentHintIndex,
        isShowingHints,
        progress,
        currentView,
        setCurrentView,
        startTutorial,
        nextHint,
        previousHint,
        skipTutorial,
        closeTutorial,
        resetTutorial
      }}
    >
      {children}
    </HintTutorialContext.Provider>
  );
}

export function useHintTutorial() {
  const context = useContext(HintTutorialContext);
  if (context === undefined) {
    throw new Error('useHintTutorial must be used within a HintTutorialProvider');
  }
  return context;
}
