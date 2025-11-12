import { Hint } from '../types/hints';

// Parse the hints configuration from markdown format
export function parseHintsConfig(markdown: string): Hint[] {
  const hints: Hint[] = [];

  // Split by "### Hint" sections
  const sections = markdown.split(/### Hint \d+:/);

  // Skip the first section (header)
  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];

    try {
      const hint = parseHintSection(section);
      if (hint) {
        hints.push(hint);
      }
    } catch (error) {
      console.error('Error parsing hint section:', error);
    }
  }

  return hints.sort((a, b) => a.order - b.order);
}

function parseHintSection(section: string): Hint | null {
  const lines = section.split('\n').map(line => line.trim()).filter(line => line);

  if (lines.length === 0) return null;

  const hint: Partial<Hint> = {};

  // Extract title (first line)
  hint.title = lines[0];

  // Parse properties
  for (const line of lines) {
    if (line.startsWith('- **ID**:')) {
      hint.id = extractValue(line);
    } else if (line.startsWith('- **Title**:')) {
      hint.title = extractValue(line);
    } else if (line.startsWith('- **Description**:')) {
      hint.description = extractValue(line);
    } else if (line.startsWith('- **Target**:')) {
      hint.target = extractValue(line).replace(/`/g, '');
    } else if (line.startsWith('- **Position**:')) {
      hint.position = extractValue(line) as Hint['position'];
    } else if (line.startsWith('- **OffsetX**:')) {
      hint.offsetX = parseInt(extractValue(line));
    } else if (line.startsWith('- **OffsetY**:')) {
      hint.offsetY = parseInt(extractValue(line));
    } else if (line.startsWith('- **Page**:')) {
      hint.page = extractValue(line);
    } else if (line.startsWith('- **Order**:')) {
      hint.order = parseInt(extractValue(line));
    } else if (line.startsWith('- **ShowOn**:')) {
      hint.showOn = extractValue(line) as Hint['showOn'];
    }
  }

  // Validate required fields
  if (!hint.id || !hint.title || !hint.description || !hint.target || !hint.position || !hint.page) {
    console.warn('Invalid hint configuration:', hint);
    return null;
  }

  return hint as Hint;
}

function extractValue(line: string): string {
  const match = line.match(/:\s*(.+)/);
  return match ? match[1].trim() : '';
}

// Filter hints for current page and device
export function getHintsForPage(
  hints: Hint[],
  page: string,
  isMobile: boolean
): Hint[] {
  return hints.filter(hint => {
    // Check page match
    if (hint.page !== page) return false;

    // Check device compatibility
    if (hint.showOn === 'desktop' && isMobile) return false;
    if (hint.showOn === 'mobile' && !isMobile) return false;

    return true;
  });
}
