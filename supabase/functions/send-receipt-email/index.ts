// Supabase Edge Function: Send Receipt Email
// Sends a payment receipt email to students after successful payment
//
// TEMPLATE CUSTOMIZATION:
// To customize the receipt email appearance, edit the template.ts file in this directory.
// You can change colors, company info, layout, and more without touching this file.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateReceiptHTML, type ReceiptData } from './template.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      }
    })
  }

  try {
    // Parse request body
    const { transactionId } = await req.json()

    if (!transactionId) {
      throw new Error('Transaction ID is required')
    }

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Fetch transaction details with related data
    const { data: transaction, error: fetchError } = await supabase
      .from('payment_transactions')
      .select(`
        *,
        profiles!payment_transactions_user_id_fkey(email, first_name, last_name),
        subscription_tiers(display_name),
        payment_methods(display_name),
        grade_levels(name)
      `)
      .eq('id', transactionId)
      .single()

    if (fetchError || !transaction) {
      throw new Error(`Transaction not found: ${fetchError?.message}`)
    }

    // Fetch subject names if selected_subject_ids exist
    let subjectNames: string[] = []
    if (transaction.selected_subject_ids && transaction.selected_subject_ids.length > 0) {
      const { data: subjects, error: subjectsError } = await supabase
        .from('subjects')
        .select('name')
        .in('id', transaction.selected_subject_ids)

      if (!subjectsError && subjects) {
        subjectNames = subjects.map((s: any) => s.name)
      }
    }

    // Check if receipt already sent
    if (transaction.receipt_sent) {
      console.log(`Receipt already sent for transaction ${transactionId}`)
      return new Response(
        JSON.stringify({ success: true, message: 'Receipt already sent' }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Prepare receipt data
    const userName = transaction.profiles?.first_name
      ? `${transaction.profiles.first_name} ${transaction.profiles.last_name || ''}`.trim()
      : 'Valued Customer'

    const receiptData: ReceiptData = {
      transactionId: transaction.id,
      userEmail: transaction.profiles?.email || '',
      userName,
      amount: parseFloat(transaction.amount),
      currency: transaction.currency,
      tierName: transaction.subscription_tiers?.display_name || 'Subscription',
      billingCycle: transaction.billing_cycle,
      paymentMethod: transaction.payment_methods?.display_name || 'Unknown',
      transactionDate: transaction.created_at,
      selectedGrade: transaction.grade_levels?.name,
      selectedSubjects: subjectNames.length > 0 ? subjectNames : undefined,
      couponCode: transaction.metadata?.coupon_code,
      discountPercentage: transaction.metadata?.discount_percentage,
      originalAmount: transaction.metadata?.original_amount
    }

    // Generate HTML email
    const htmlContent = generateReceiptHTML(receiptData)

    // Send email via Resend
    // Using Resend's test domain for development
    // TODO: Change to 'ExamV2 <noreply@yourdomain.com>' after verifying your domain in Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'ExamV2 <onboarding@resend.dev>',
        to: [receiptData.userEmail],
        subject: `Payment Receipt - ${receiptData.tierName} Subscription`,
        html: htmlContent
      })
    })

    const resendData = await resendResponse.json()

    if (!resendResponse.ok) {
      throw new Error(`Resend API error: ${JSON.stringify(resendData)}`)
    }

    // Mark receipt as sent in database
    const { error: markError } = await supabase.rpc('mark_receipt_sent', {
      p_transaction_id: transactionId,
      p_email: receiptData.userEmail,
      p_receipt_id: resendData.id
    })

    if (markError) {
      console.error('Error marking receipt as sent:', markError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Receipt sent successfully',
        receiptId: resendData.id
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    )

  } catch (error) {
    console.error('Error sending receipt:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      }
    )
  }
})
