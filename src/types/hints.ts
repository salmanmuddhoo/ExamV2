export interface Hint {
  id: string;
  title: string;
  description: string;
  target: string;
  position: 'top' | 'bottom' | 'left' | 'right' | 'center';
  offsetX: number;
  offsetY: number;
  page: string;
  order: number;
  showOn: 'desktop' | 'mobile' | 'both';
}

export interface HintProgress {
  seenHints: string[];
  currentHintIndex: number;
  tutorialCompleted: boolean;
  lastShownDate: string;
}
