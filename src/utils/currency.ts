// Currency utility functions

import { supabase } from '../lib/supabase';

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

/**
 * Convert price from USD to target currency using database exchange rates
 * @param priceUSD - Price in USD
 * @param targetCurrency - Target currency code
 * @returns Converted price in target currency
 */
export async function convertPrice(priceUSD: number, targetCurrency: string): Promise<number> {
  try {
    // If already USD, no conversion needed
    if (targetCurrency === 'USD') {
      return priceUSD;
    }

    // Fetch exchange rate from database
    const { data, error } = await supabase
      .from('currency_exchange_rates')
      .select('rate_to_usd')
      .eq('currency_code', targetCurrency)
      .single();

    if (error || !data) {
      console.error('Failed to fetch exchange rate, returning USD price:', error);
      return priceUSD;
    }

    // Convert: price_in_currency = price_in_usd * rate_to_usd
    return Math.round(priceUSD * data.rate_to_usd * 100) / 100; // Round to 2 decimals
  } catch (error) {
    console.error('Error converting price:', error);
    return priceUSD;
  }
}

/**
 * Format and convert price from USD to target currency
 * @param priceUSD - Price in USD
 * @param targetCurrency - Target currency code
 * @returns Formatted price string with currency symbol
 */
export async function formatConvertedPrice(priceUSD: number, targetCurrency: string): Promise<string> {
  const convertedPrice = await convertPrice(priceUSD, targetCurrency);
  return formatPrice(convertedPrice, targetCurrency);
}
