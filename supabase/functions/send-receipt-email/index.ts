// Supabase Edge Function: Send Receipt Email
// Sends a payment receipt email to students after successful payment

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface ReceiptData {
  transactionId: string
  userEmail: string
  userName: string
  amount: number
  currency: string
  tierName: string
  billingCycle: string
  paymentMethod: string
  transactionDate: string
  selectedGrade?: string
  selectedSubjects?: string[]
  couponCode?: string
  discountPercentage?: number
  originalAmount?: number
}

const generateReceiptHTML = (data: ReceiptData): string => {
  const {
    transactionId,
    userName,
    amount,
    currency,
    tierName,
    billingCycle,
    paymentMethod,
    transactionDate,
    selectedGrade,
    selectedSubjects,
    couponCode,
    discountPercentage,
    originalAmount
  } = data

  const formattedDate = new Date(transactionDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })

  const formatAmount = (amt: number, curr: string) => {
    if (curr === 'MUR') {
      return `Rs ${amt.toLocaleString()}`
    }
    return `$${amt.toFixed(2)}`
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Receipt</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: #f3f4f6;
        }
        .container {
            max-width: 600px;
            margin: 40px auto;
            background-color: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
        }
        .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 600;
        }
        .header p {
            margin: 10px 0 0;
            font-size: 16px;
            opacity: 0.9;
        }
        .content {
            padding: 40px 30px;
        }
        .greeting {
            font-size: 18px;
            color: #1f2937;
            margin-bottom: 20px;
        }
        .receipt-box {
            background-color: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 24px;
            margin: 24px 0;
        }
        .receipt-row {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid #e5e7eb;
        }
        .receipt-row:last-child {
            border-bottom: none;
        }
        .receipt-label {
            color: #6b7280;
            font-size: 14px;
        }
        .receipt-value {
            color: #1f2937;
            font-weight: 500;
            font-size: 14px;
            text-align: right;
        }
        .total-row {
            background-color: #f3f4f6;
            padding: 16px;
            border-radius: 6px;
            margin-top: 12px;
        }
        .total-row .receipt-label {
            font-size: 16px;
            font-weight: 600;
            color: #1f2937;
        }
        .total-row .receipt-value {
            font-size: 24px;
            font-weight: 700;
            color: #10b981;
        }
        .discount-badge {
            display: inline-block;
            background-color: #dcfce7;
            color: #166534;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 600;
            margin-left: 8px;
        }
        .package-info {
            background-color: #eff6ff;
            border-left: 4px solid #3b82f6;
            padding: 16px;
            border-radius: 4px;
            margin: 20px 0;
        }
        .package-info h3 {
            margin: 0 0 12px;
            color: #1e40af;
            font-size: 16px;
        }
        .package-info p {
            margin: 6px 0;
            color: #1f2937;
            font-size: 14px;
        }
        .footer {
            background-color: #f9fafb;
            padding: 30px;
            text-align: center;
            border-top: 1px solid #e5e7eb;
        }
        .footer p {
            margin: 8px 0;
            color: #6b7280;
            font-size: 14px;
        }
        .button {
            display: inline-block;
            background-color: #667eea;
            color: white;
            padding: 12px 32px;
            text-decoration: none;
            border-radius: 6px;
            font-weight: 500;
            margin: 20px 0;
        }
        .transaction-id {
            font-family: 'Courier New', monospace;
            background-color: #f3f4f6;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>✅ Payment Successful!</h1>
            <p>Thank you for your purchase</p>
        </div>

        <div class="content">
            <p class="greeting">Hi ${userName},</p>
            <p style="color: #4b5563; line-height: 1.6;">
                Thank you for subscribing to ExamV2! Your payment has been successfully processed,
                and your subscription is now active.
            </p>

            <div class="receipt-box">
                <h2 style="margin: 0 0 20px; color: #1f2937; font-size: 20px;">Receipt Details</h2>

                <div class="receipt-row">
                    <span class="receipt-label">Transaction ID</span>
                    <span class="receipt-value transaction-id">${transactionId.substring(0, 16)}...</span>
                </div>

                <div class="receipt-row">
                    <span class="receipt-label">Date</span>
                    <span class="receipt-value">${formattedDate}</span>
                </div>

                <div class="receipt-row">
                    <span class="receipt-label">Subscription Plan</span>
                    <span class="receipt-value">${tierName}</span>
                </div>

                <div class="receipt-row">
                    <span class="receipt-label">Billing Cycle</span>
                    <span class="receipt-value">${billingCycle.charAt(0).toUpperCase() + billingCycle.slice(1)}</span>
                </div>

                <div class="receipt-row">
                    <span class="receipt-label">Payment Method</span>
                    <span class="receipt-value">${paymentMethod}</span>
                </div>

                ${originalAmount && couponCode ? `
                <div class="receipt-row">
                    <span class="receipt-label">Original Amount</span>
                    <span class="receipt-value" style="text-decoration: line-through; opacity: 0.6;">
                        ${formatAmount(originalAmount, currency)}
                    </span>
                </div>

                <div class="receipt-row">
                    <span class="receipt-label">Discount</span>
                    <span class="receipt-value">
                        -${formatAmount(originalAmount - amount, currency)}
                        <span class="discount-badge">${couponCode} (${discountPercentage}% OFF)</span>
                    </span>
                </div>
                ` : ''}

                <div class="total-row">
                    <div class="receipt-row" style="border: none; padding: 0;">
                        <span class="receipt-label">Total Paid</span>
                        <span class="receipt-value">${formatAmount(amount, currency)}</span>
                    </div>
                </div>
            </div>

            ${selectedGrade || (selectedSubjects && selectedSubjects.length > 0) ? `
            <div class="package-info">
                <h3>📚 Your Package Details</h3>
                ${selectedGrade ? `<p><strong>Grade Level:</strong> ${selectedGrade}</p>` : ''}
                ${selectedSubjects && selectedSubjects.length > 0 ? `
                <p><strong>Subjects:</strong> ${selectedSubjects.join(', ')}</p>
                ` : ''}
            </div>
            ` : ''}

            <p style="color: #4b5563; margin-top: 30px; line-height: 1.6;">
                Your subscription is now active and you have full access to all features included in your plan.
                If you have any questions or need assistance, please don't hesitate to contact our support team.
            </p>

            <div style="text-align: center;">
                <a href="${SUPABASE_URL?.replace('/rest/v1', '')}" class="button">
                    Access Your Account
                </a>
            </div>
        </div>

        <div class="footer">
            <p style="font-weight: 600; color: #1f2937;">ExamV2</p>
            <p>This is an automated receipt for your records.</p>
            <p>Please keep this email for your reference.</p>
            <p style="margin-top: 20px; font-size: 12px;">
                If you did not make this purchase, please contact us immediately.
            </p>
        </div>
    </div>
</body>
</html>
  `.trim()
}

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
        grade_levels(name),
        subjects(name)
      `)
      .eq('id', transactionId)
      .single()

    if (fetchError || !transaction) {
      throw new Error(`Transaction not found: ${fetchError?.message}`)
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
      selectedSubjects: transaction.subjects?.map((s: any) => s.name),
      couponCode: transaction.metadata?.coupon_code,
      discountPercentage: transaction.metadata?.discount_percentage,
      originalAmount: transaction.metadata?.original_amount
    }

    // Generate HTML email
    const htmlContent = generateReceiptHTML(receiptData)

    // Send email via Resend
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`
      },
      body: JSON.stringify({
        from: 'ExamV2 <noreply@examv2.com>',
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
