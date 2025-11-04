import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface HintStatus {
  chatHubNewConversation: boolean;
  mobileToggle: boolean;
  chatInput: boolean;
  tokenCounter: boolean;
  profileSubscription: boolean;
}

interface FirstTimeHintsContextType {
  hintsSeen: HintStatus;
  markHintAsSeen: (hint: keyof HintStatus) => void;
  resetAllHints: () => void;
  shouldShowHint: (hint: keyof HintStatus) => boolean;
}

const FirstTimeHintsContext = createContext<FirstTimeHintsContextType | undefined>(undefined);

const STORAGE_KEY = 'firstTimeHints';

const defaultHintStatus: HintStatus = {
  chatHubNewConversation: false,
  mobileToggle: false,
  chatInput: false,
  tokenCounter: false,
  profileSubscription: false,
};

// Define the order in which hints should appear
const HINT_ORDER: (keyof HintStatus)[] = [
  'chatHubNewConversation',  // 1st: When user arrives at chat hub
  'mobileToggle',            // 2nd: When user is on mobile viewing exam/practice
  'chatInput',               // 3rd: Show where to type questions
  'tokenCounter',            // 4th: After user sends their first message
  'profileSubscription',     // 5th: After token counter is seen
];

export function FirstTimeHintsProvider({ children }: { children: ReactNode }) {
  const [hintsSeen, setHintsSeen] = useState<HintStatus>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return { ...defaultHintStatus, ...JSON.parse(stored) };
      } catch {
        return defaultHintStatus;
      }
    }
    return defaultHintStatus;
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hintsSeen));
  }, [hintsSeen]);

  const markHintAsSeen = (hint: keyof HintStatus) => {
    setHintsSeen(prev => ({ ...prev, [hint]: true }));
  };

  const resetAllHints = () => {
    setHintsSeen(defaultHintStatus);
    localStorage.removeItem(STORAGE_KEY);
  };

  const shouldShowHint = (hint: keyof HintStatus) => {
    // Don't show if already seen
    if (hintsSeen[hint]) {
      return false;
    }

    // Find the index of this hint in the order
    const hintIndex = HINT_ORDER.indexOf(hint);

    // If hint is not in the order array, show it immediately (backwards compatibility)
    if (hintIndex === -1) {
      return true;
    }

    // Check if all previous hints in the sequence have been seen
    for (let i = 0; i < hintIndex; i++) {
      const previousHint = HINT_ORDER[i];
      if (!hintsSeen[previousHint]) {
        // A previous hint hasn't been seen yet, so don't show this one
        return false;
      }
    }

    // All previous hints have been seen, show this one
    return true;
  };

  return (
    <FirstTimeHintsContext.Provider
      value={{
        hintsSeen,
        markHintAsSeen,
        resetAllHints,
        shouldShowHint,
      }}
    >
      {children}
    </FirstTimeHintsContext.Provider>
  );
}

export function useFirstTimeHints() {
  const context = useContext(FirstTimeHintsContext);
  if (!context) {
    throw new Error('useFirstTimeHints must be used within FirstTimeHintsProvider');
  }
  return context;
}
