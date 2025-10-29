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
 * - Change colors: Look for BRAND_COLORS below
 * - Add logo: Set logoUrl in BRAND_INFO
 * - Update company name: Change companyName in BRAND_INFO
 * - Modify footer: Edit the footer section at the bottom
 * - Change button URL: Update websiteUrl in BRAND_INFO
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
    // Monochrome professional color scheme
    primary: '#000000',          // Black for headers and primary text
    secondary: '#6b7280',        // Gray for secondary text
    border: '#e5e7eb',           // Light gray for borders
    background: '#ffffff',       // White background
    lightBackground: '#f9fafb',  // Light gray background for sections
    success: '#000000',          // Black for total amount (professional)
  }

  const BRAND_INFO = {
    companyName: 'ExamV2',
    // logoUrl: 'https://yourdomain.com/logo.png',  // Uncomment and add your logo URL
    supportEmail: 'support@examv2.com',
    websiteUrl: 'https://exam-v2.vercel.app',
  }

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Receipt</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">

    <!-- Main Container -->
    <div style="max-width: 650px; margin: 40px auto; background-color: ${BRAND_COLORS.background}; border: 2px solid ${BRAND_COLORS.border}; border-radius: 12px; overflow: hidden;">

        <!-- Header -->
        <div style="background-color: ${BRAND_COLORS.primary}; color: white; padding: 48px 40px; text-align: center; border-bottom: 2px solid ${BRAND_COLORS.border};">
            ${BRAND_INFO.logoUrl ? `<img src="${BRAND_INFO.logoUrl}" alt="${BRAND_INFO.companyName}" style="width: 120px; margin-bottom: 24px;">` : ''}
            <h1 style="margin: 0 0 12px 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">Payment Receipt</h1>
            <p style="margin: 0; font-size: 16px; opacity: 0.9; font-weight: 400;">Thank you for your purchase</p>
        </div>

        <!-- Content -->
        <div style="padding: 48px 40px;">

            <!-- Greeting -->
            <div style="margin-bottom: 32px;">
                <p style="margin: 0 0 16px 0; font-size: 18px; color: ${BRAND_COLORS.primary}; font-weight: 600;">Hi ${userName},</p>
                <p style="margin: 0; font-size: 15px; color: ${BRAND_COLORS.secondary}; line-height: 1.6;">
                    Thank you for subscribing to ${BRAND_INFO.companyName}. Your payment has been successfully processed and your subscription is now active.
                </p>
            </div>

            <!-- Receipt Box -->
            <div style="background-color: ${BRAND_COLORS.lightBackground}; border: 2px solid ${BRAND_COLORS.border}; border-radius: 8px; padding: 32px; margin: 32px 0;">

                <h2 style="margin: 0 0 24px 0; color: ${BRAND_COLORS.primary}; font-size: 18px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Transaction Details</h2>

                <!-- Transaction ID -->
                <div style="display: flex; justify-content: space-between; align-items: baseline; padding: 16px 0; border-bottom: 1px solid ${BRAND_COLORS.border};">
                    <span style="color: ${BRAND_COLORS.secondary}; font-size: 14px; font-weight: 500;">Transaction ID</span>
                    <span style="color: ${BRAND_COLORS.primary}; font-size: 13px; font-family: 'Courier New', monospace; font-weight: 500; background-color: white; padding: 4px 8px; border-radius: 4px; border: 1px solid ${BRAND_COLORS.border};">${transactionId.substring(0, 20)}...</span>
                </div>

                <!-- Date -->
                <div style="display: flex; justify-content: space-between; align-items: baseline; padding: 16px 0; border-bottom: 1px solid ${BRAND_COLORS.border};">
                    <span style="color: ${BRAND_COLORS.secondary}; font-size: 14px; font-weight: 500;">Date</span>
                    <span style="color: ${BRAND_COLORS.primary}; font-size: 14px; font-weight: 600;">${formattedDate}</span>
                </div>

                <!-- Subscription Plan -->
                <div style="display: flex; justify-content: space-between; align-items: baseline; padding: 16px 0; border-bottom: 1px solid ${BRAND_COLORS.border};">
                    <span style="color: ${BRAND_COLORS.secondary}; font-size: 14px; font-weight: 500;">Subscription Plan</span>
                    <span style="color: ${BRAND_COLORS.primary}; font-size: 14px; font-weight: 600;">${tierName}</span>
                </div>

                <!-- Billing Cycle -->
                <div style="display: flex; justify-content: space-between; align-items: baseline; padding: 16px 0; border-bottom: 1px solid ${BRAND_COLORS.border};">
                    <span style="color: ${BRAND_COLORS.secondary}; font-size: 14px; font-weight: 500;">Billing Cycle</span>
                    <span style="color: ${BRAND_COLORS.primary}; font-size: 14px; font-weight: 600;">${billingCycle.charAt(0).toUpperCase() + billingCycle.slice(1)}</span>
                </div>

                <!-- Payment Method -->
                <div style="display: flex; justify-content: space-between; align-items: baseline; padding: 16px 0; border-bottom: 1px solid ${BRAND_COLORS.border};">
                    <span style="color: ${BRAND_COLORS.secondary}; font-size: 14px; font-weight: 500;">Payment Method</span>
                    <span style="color: ${BRAND_COLORS.primary}; font-size: 14px; font-weight: 600;">${paymentMethod}</span>
                </div>

                ${originalAmount && couponCode ? `
                <!-- Original Amount -->
                <div style="display: flex; justify-content: space-between; align-items: baseline; padding: 16px 0; border-bottom: 1px solid ${BRAND_COLORS.border};">
                    <span style="color: ${BRAND_COLORS.secondary}; font-size: 14px; font-weight: 500;">Original Amount</span>
                    <span style="color: ${BRAND_COLORS.secondary}; font-size: 14px; font-weight: 500; text-decoration: line-through;">${formatAmount(originalAmount, currency)}</span>
                </div>

                <!-- Discount -->
                <div style="display: flex; justify-content: space-between; align-items: baseline; padding: 16px 0; border-bottom: 1px solid ${BRAND_COLORS.border};">
                    <span style="color: ${BRAND_COLORS.secondary}; font-size: 14px; font-weight: 500;">Discount</span>
                    <div style="text-align: right;">
                        <span style="color: ${BRAND_COLORS.primary}; font-size: 14px; font-weight: 600;">-${formatAmount(originalAmount - amount, currency)}</span>
                        <span style="display: inline-block; margin-left: 8px; background-color: ${BRAND_COLORS.primary}; color: white; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.3px;">${couponCode} · ${discountPercentage}% OFF</span>
                    </div>
                </div>
                ` : ''}

                <!-- Total Paid (Properly Aligned) -->
                <div style="background-color: white; border: 2px solid ${BRAND_COLORS.primary}; border-radius: 8px; padding: 20px; margin-top: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="color: ${BRAND_COLORS.primary}; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Total Paid</span>
                        <span style="color: ${BRAND_COLORS.success}; font-size: 28px; font-weight: 800; letter-spacing: -0.5px;">${formatAmount(amount, currency)}</span>
                    </div>
                </div>
            </div>

            ${selectedGrade || (selectedSubjects && selectedSubjects.length > 0) ? `
            <!-- Package Details -->
            <div style="background-color: white; border: 2px solid ${BRAND_COLORS.border}; border-radius: 8px; padding: 24px; margin: 24px 0;">
                <h3 style="margin: 0 0 16px 0; color: ${BRAND_COLORS.primary}; font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">📚 Your Package</h3>
                ${selectedGrade ? `<p style="margin: 0 0 8px 0; font-size: 14px; color: ${BRAND_COLORS.primary};"><strong style="font-weight: 600;">Grade Level:</strong> ${selectedGrade}</p>` : ''}
                ${selectedSubjects && selectedSubjects.length > 0 ? `<p style="margin: 0; font-size: 14px; color: ${BRAND_COLORS.primary};"><strong style="font-weight: 600;">Subjects:</strong> ${selectedSubjects.join(', ')}</p>` : ''}
            </div>
            ` : ''}

            <!-- Message -->
            <div style="margin: 32px 0; padding: 24px; background-color: ${BRAND_COLORS.lightBackground}; border-left: 4px solid ${BRAND_COLORS.primary}; border-radius: 4px;">
                <p style="margin: 0; font-size: 14px; color: ${BRAND_COLORS.primary}; line-height: 1.6;">
                    Your subscription is now active. You have full access to all features included in your plan. If you have any questions, please contact our support team.
                </p>
            </div>

            <!-- Button -->
            <div style="text-align: center; margin: 32px 0;">
                <a href="${BRAND_INFO.websiteUrl}" style="display: inline-block; background-color: ${BRAND_COLORS.primary}; color: white; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 15px; letter-spacing: 0.3px; border: 2px solid ${BRAND_COLORS.primary};">Access Your Account</a>
            </div>
        </div>

        <!-- Footer -->
        <div style="background-color: ${BRAND_COLORS.lightBackground}; padding: 32px 40px; text-align: center; border-top: 2px solid ${BRAND_COLORS.border};">
            <p style="margin: 0 0 8px 0; color: ${BRAND_COLORS.primary}; font-size: 16px; font-weight: 700;">${BRAND_INFO.companyName}</p>
            <p style="margin: 0 0 4px 0; color: ${BRAND_COLORS.secondary}; font-size: 13px;">This is an automated receipt for your records.</p>
            <p style="margin: 0 0 20px 0; color: ${BRAND_COLORS.secondary}; font-size: 13px;">Please keep this email for your reference.</p>
            <p style="margin: 0; color: ${BRAND_COLORS.secondary}; font-size: 12px;">
                If you did not make this purchase, please contact us immediately at <a href="mailto:${BRAND_INFO.supportEmail}" style="color: ${BRAND_COLORS.primary}; text-decoration: underline;">${BRAND_INFO.supportEmail}</a>
            </p>
        </div>
    </div>

</body>
</html>
  `.trim()
}
