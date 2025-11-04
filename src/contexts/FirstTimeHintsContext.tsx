import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface HintStatus {
  chatHubNewConversation: boolean;
  mobileToggle: boolean;
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
  tokenCounter: false,
  profileSubscription: false,
};

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
    return !hintsSeen[hint];
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
