/**
 * Format token count for display
 * - Above 1M: Show as "M" (e.g., "6M", "5.9M", "1.2M")
 * - Below 1M: Show as "K" (e.g., "900K", "500K", "100K")
 *
 * @param tokens - The number of tokens
 * @param decimals - Number of decimal places for million display (default: 1)
 * @returns Formatted string
 */
export function formatTokenCount(tokens: number | null, decimals: number = 1): string {
  if (tokens === null) {
    return 'Unlimited';
  }

  const absTokens = Math.abs(tokens);

  // Above or equal to 1 million: show as "M"
  if (absTokens >= 1_000_000) {
    const millions = tokens / 1_000_000;
    // Only show decimal if needed
    if (millions % 1 === 0) {
      return `${Math.floor(millions)}M`;
    }
    return `${millions.toFixed(decimals)}M`;
  }

  // Below 1 million: show as "K"
  if (absTokens >= 1_000) {
    const thousands = tokens / 1_000;
    // Only show decimal if needed
    if (thousands % 1 === 0) {
      return `${Math.floor(thousands)}K`;
    }
    return `${thousands.toFixed(decimals)}K`;
  }

  // Below 1000: show raw number
  return tokens.toString();
}

/**
 * Format token usage display (e.g., "5.9M / 6M" or "900K / 1M")
 *
 * @param used - Number of tokens used
 * @param limit - Total token limit (null for unlimited)
 * @returns Formatted string like "5.9M / 6M"
 */
export function formatTokenUsage(used: number, limit: number | null): string {
  if (limit === null) {
    return 'Unlimited';
  }

  return `${formatTokenCount(used)} / ${formatTokenCount(limit)}`;
}
