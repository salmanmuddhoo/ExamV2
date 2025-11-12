import { useEffect } from 'react';
import { useHintTutorial } from '../contexts/HintTutorialContext';
import { HintTooltip } from './HintTooltip';
import { useAuth } from '../contexts/AuthContext';

export function HintTutorialManager() {
  const { user } = useAuth();
  const {
    currentHints,
    currentHintIndex,
    isShowingHints,
    progress,
    currentView,
    startTutorial,
    nextHint,
    previousHint,
    skipTutorial,
    closeTutorial
  } = useHintTutorial();

  useEffect(() => {
    // Only show hints for authenticated users
    if (!user) return;

    // Don't show if tutorial was completed
    if (progress.tutorialCompleted) return;

    // Don't show if no view is set
    if (!currentView) return;

    // Optional: Check if user is new (account created within last 7 days for easier testing)
    // Comment out or increase time limit for development/testing
    if (user.created_at) {
      const accountAge = Date.now() - new Date(user.created_at).getTime();
      const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000; // Changed from 1 day to 7 days

      // Only show to new users (or comment this block for testing)
      if (accountAge > sevenDaysInMs) return;
    }

    // Delay to let page load
    const timer = setTimeout(() => {
      startTutorial(currentView);
    }, 1000);

    return () => clearTimeout(timer);
  }, [currentView, user, progress.tutorialCompleted, startTutorial]);

  if (!isShowingHints || currentHints.length === 0) {
    return null;
  }

  const currentHint = currentHints[currentHintIndex];

  return (
    <HintTooltip
      hint={currentHint}
      currentIndex={currentHintIndex}
      totalHints={currentHints.length}
      onNext={nextHint}
      onPrevious={previousHint}
      onSkip={skipTutorial}
      onClose={closeTutorial}
    />
  );
}
