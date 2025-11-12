import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useHintTutorial } from '../contexts/HintTutorialContext';
import { HintTooltip } from './HintTooltip';
import { useAuth } from '../contexts/AuthContext';

export function HintTutorialManager() {
  const location = useLocation();
  const { user } = useAuth();
  const {
    currentHints,
    currentHintIndex,
    isShowingHints,
    progress,
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

    // Check if user is new (account created within last 24 hours)
    if (user.created_at) {
      const accountAge = Date.now() - new Date(user.created_at).getTime();
      const oneDayInMs = 24 * 60 * 60 * 1000;

      // Only show to new users
      if (accountAge > oneDayInMs) return;
    }

    // Delay to let page load
    const timer = setTimeout(() => {
      startTutorial(location.pathname);
    }, 1000);

    return () => clearTimeout(timer);
  }, [location.pathname, user, progress.tutorialCompleted]);

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
