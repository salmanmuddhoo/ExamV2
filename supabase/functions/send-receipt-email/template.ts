// Receipt Email Template
// Edit this file to customize the receipt email appearance

export interface ReceiptData {
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

/**
 * Generates the HTML email template for payment receipts
 *
 * CUSTOMIZATION GUIDE:
 * - Change colors: Look for "background:", "color:", etc.
 * - Add logo: Add <img> tag in the header section
 * - Update company name: Find/replace "ExamV2"
 * - Modify footer: Edit the footer section at the bottom
 * - Change button URL: Update the href in the button
 */
export function generateReceiptHTML(data: ReceiptData): string {
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

  // ============================================================
  // CUSTOMIZATION SECTION - BRANDING & COLORS
  // ============================================================

  const BRAND_COLORS = {
    // Header gradient colors (change these for different brand colors)
    headerGradientStart: '#667eea',  // Purple-blue
    headerGradientEnd: '#764ba2',    // Purple

    // Alternative color schemes (uncomment to use):
    // Green: '#11998e' and '#38ef7d'
    // Orange: '#f46b45' and '#eea849'
    // Blue: '#2196F3' and '#21CBF3'
    // Red: '#eb3349' and '#f45c43'

    // Text colors
    primaryText: '#1f2937',
    secondaryText: '#6b7280',

    // Success/highlight color
    successColor: '#10b981',

    // Button color
    buttonColor: '#667eea',
  }

  const BRAND_INFO = {
    companyName: 'ExamV2',  // Change to your company name
    // logoUrl: 'https://yourdomain.com/logo.png',  // Uncomment and add your logo URL
    supportEmail: 'support@examv2.com',  // Change to your support email
    websiteUrl: 'https://exam-v2.vercel.app',  // Change to your website
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
            background: linear-gradient(135deg, ${BRAND_COLORS.headerGradientStart} 0%, ${BRAND_COLORS.headerGradientEnd} 100%);
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
        .logo {
            width: 150px;
            margin-bottom: 20px;
        }
        .content {
            padding: 40px 30px;
        }
        .greeting {
            font-size: 18px;
            color: ${BRAND_COLORS.primaryText};
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
            color: ${BRAND_COLORS.secondaryText};
            font-size: 14px;
        }
        .receipt-value {
            color: ${BRAND_COLORS.primaryText};
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
            color: ${BRAND_COLORS.primaryText};
        }
        .total-row .receipt-value {
            font-size: 24px;
            font-weight: 700;
            color: ${BRAND_COLORS.successColor};
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
            color: ${BRAND_COLORS.primaryText};
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
            color: ${BRAND_COLORS.secondaryText};
            font-size: 14px;
        }
        .button {
            display: inline-block;
            background-color: ${BRAND_COLORS.buttonColor};
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
            ${BRAND_INFO.logoUrl ? `<img src="${BRAND_INFO.logoUrl}" alt="${BRAND_INFO.companyName} Logo" class="logo">` : ''}
            <h1>✅ Payment Successful!</h1>
            <p>Thank you for your purchase</p>
        </div>

        <div class="content">
            <p class="greeting">Hi ${userName},</p>
            <p style="color: #4b5563; line-height: 1.6;">
                Thank you for subscribing to ${BRAND_INFO.companyName}! Your payment has been successfully processed,
                and your subscription is now active.
            </p>

            <div class="receipt-box">
                <h2 style="margin: 0 0 20px; color: ${BRAND_COLORS.primaryText}; font-size: 20px;">Receipt Details</h2>

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
                <a href="${BRAND_INFO.websiteUrl}" class="button">
                    Access Your Account
                </a>
            </div>
        </div>

        <div class="footer">
            <p style="font-weight: 600; color: ${BRAND_COLORS.primaryText};">${BRAND_INFO.companyName}</p>
            <p>This is an automated receipt for your records.</p>
            <p>Please keep this email for your reference.</p>
            <p style="margin-top: 20px; font-size: 12px;">
                If you did not make this purchase, please contact us immediately at ${BRAND_INFO.supportEmail}
            </p>

            <!-- Add social media links here if needed -->
            <!--
            <div style="margin-top: 20px;">
                <a href="https://twitter.com/yourcompany" style="margin: 0 10px; text-decoration: none; color: #667eea;">Twitter</a>
                <a href="https://facebook.com/yourcompany" style="margin: 0 10px; text-decoration: none; color: #667eea;">Facebook</a>
                <a href="https://linkedin.com/company/yourcompany" style="margin: 0 10px; text-decoration: none; color: #667eea;">LinkedIn</a>
            </div>
            -->
        </div>
    </div>
</body>
</html>
  `.trim()
}
