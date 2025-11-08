// Currency utility functions

export interface Currency {
  code: string;
  symbol: string;
  name: string;
}

export const currencies: Currency[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'MUR', symbol: 'Rs', name: 'Mauritian Rupee' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
];

/**
 * Get currency symbol from currency code
 * @param currencyCode - Currency code (e.g., 'USD', 'EUR', 'MUR')
 * @returns Currency symbol (e.g., '$', '€', 'Rs')
 */
export function getCurrencySymbol(currencyCode: string): string {
  const currency = currencies.find(c => c.code === currencyCode);
  return currency?.symbol || '$'; // Default to $ if currency not found
}

/**
 * Format price with currency symbol
 * @param price - The numeric price
 * @param currencyCode - Currency code (e.g., 'USD', 'EUR', 'MUR')
 * @returns Formatted price string (e.g., '$10.00', 'Rs 500', '€12.50')
 */
export function formatPrice(price: number, currencyCode: string = 'USD'): string {
  const symbol = getCurrencySymbol(currencyCode);
  const formattedAmount = price.toFixed(2);

  // For Rs (Mauritian Rupee), use "Rs X" format, otherwise use "$X" format
  if (symbol === 'Rs' || symbol === '₹') {
    return `${symbol} ${formattedAmount}`;
  }

  return `${symbol}${formattedAmount}`;
}
