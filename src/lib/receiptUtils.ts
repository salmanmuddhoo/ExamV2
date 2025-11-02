// Receipt Utility Functions
// Helper functions for sending payment receipts to customers

import { supabase } from './supabase';

/**
 * Sends a receipt email for a payment transaction
 * @param transactionId - The ID of the payment transaction
 * @returns Promise<{success: boolean, error?: string}>
 */
export async function sendReceiptEmail(transactionId: string): Promise<{
  success: boolean;
  error?: string;
  receiptId?: string;
}> {
  try {
    // Call the Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('send-receipt-email', {
      body: { transactionId }
    });

    if (error) {
      console.error('Error invoking send-receipt-email function:', error);
      return {
        success: false,
        error: error.message || 'Failed to send receipt email'
      };
    }

    if (!data?.success) {
      console.error('Receipt email function returned error:', data?.error);
      return {
        success: false,
        error: data?.error || 'Failed to send receipt email'
      };
    }

    return {
      success: true,
      receiptId: data.receiptId
    };

  } catch (error: any) {
    console.error('Error sending receipt email:', error);
    return {
      success: false,
      error: error.message || 'Unknown error occurred'
    };
  }
}

/**
 * Sends a receipt email with retry logic
 * Useful for handling temporary network failures
 * @param transactionId - The ID of the payment transaction
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Promise<{success: boolean, error?: string}>
 */
export async function sendReceiptEmailWithRetry(
  transactionId: string,
  maxRetries: number = 3
): Promise<{
  success: boolean;
  error?: string;
  receiptId?: string;
}> {
  let lastError: string = '';

  for (let attempt = 1; attempt <= maxRetries; attempt++) {

    const result = await sendReceiptEmail(transactionId);

    if (result.success) {
      return result;
    }

    lastError = result.error || 'Unknown error';

    // Don't retry if it's already sent
    if (lastError.includes('already sent')) {
      return { success: true };
    }

    // Wait before retrying (exponential backoff)
    if (attempt < maxRetries) {
      const delayMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return {
    success: false,
    error: `Failed after ${maxRetries} attempts: ${lastError}`
  };
}

/**
 * Checks if a receipt has been sent for a transaction
 * @param transactionId - The ID of the payment transaction
 * @returns Promise<boolean>
 */
export async function hasReceiptBeenSent(transactionId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('payment_transactions')
      .select('receipt_sent')
      .eq('id', transactionId)
      .single();

    if (error) {
      console.error('Error checking receipt status:', error);
      return false;
    }

    return data?.receipt_sent || false;
  } catch (error) {
    console.error('Error checking receipt status:', error);
    return false;
  }
}
