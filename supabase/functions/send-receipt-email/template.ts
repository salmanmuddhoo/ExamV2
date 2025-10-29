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

  const BRAND_COLORS = {
    primary: '#000000',
    secondary: '#6b7280',
    border: '#e5e7eb',
    background: '#ffffff',
    lightBackground: '#f9fafb',
    success: '#000000',
    gradientDark: '#4b5563',
    gradientLight: '#9ca3af',
  }

  const BRAND_INFO = {
    companyName: 'ExamV2',
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
<body style="margin:0; padding:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; background-color:#f3f4f6;">

  <!-- Main Container -->
  <div style="max-width:650px; margin:40px auto; background-color:${BRAND_COLORS.background}; border:2px solid ${BRAND_COLORS.border}; border-radius:12px; overflow:hidden;">

    <!-- Header (Two-Tone Gradient) -->
    <div style="
      background: linear-gradient(135deg, ${BRAND_COLORS.gradientDark} 0%, ${BRAND_COLORS.gradientLight} 100%);
      color:white;
      padding:48px 40px;
      text-align:center;
      border-bottom:2px solid ${BRAND_COLORS.border};
    ">
      <h1 style="margin:0 0 12px 0; font-size:32px; font-weight:700; letter-spacing:-0.5px;">Payment Receipt</h1>
      <p style="margin:0; font-size:16px; opacity:0.9;">Thank you for your purchase</p>
    </div>

    <!-- Body -->
    <div style="padding:48px 40px;">
      <p style="margin:0 0 16px 0; font-size:18px; color:${BRAND_COLORS.primary}; font-weight:600;">Hi ${userName},</p>
      <p style="margin:0; font-size:15px; color:${BRAND_COLORS.secondary}; line-height:1.6;">
        Thank you for subscribing to ${BRAND_INFO.companyName}. Your payment has been successfully processed and your subscription is now active.
      </p>

      <!-- Transaction Details -->
      <div style="background-color:${BRAND_COLORS.lightBackground}; border:2px solid ${BRAND_COLORS.border}; border-radius:8px; padding:32px; margin:32px 0;">
        <h2 style="margin:0 0 24px 0; color:${BRAND_COLORS.primary}; font-size:18px; font-weight:700; text-transform:uppercase;">Transaction Details</h2>

        <div style="display:flex; justify-content:space-between; padding:12px 0; border-bottom:1px solid ${BRAND_COLORS.border};">
          <span style="color:${BRAND_COLORS.secondary}; font-size:14px;">Transaction ID</span>
          <span style="color:${BRAND_COLORS.primary}; font-size:13px; font-family:'Courier New',monospace;">${transactionId.substring(0, 20)}...</span>
        </div>

        <div style="display:flex; justify-content:space-between; padding:12px 0; border-bottom:1px solid ${BRAND_COLORS.border};">
          <span style="color:${BRAND_COLORS.secondary}; font-size:14px;">Date</span>
          <span style="color:${BRAND_COLORS.primary}; font-size:14px;">${formattedDate}</span>
        </div>

        <div style="display:flex; justify-content:space-between; padding:12px 0; border-bottom:1px solid ${BRAND_COLORS.border};">
          <span style="color:${BRAND_COLORS.secondary}; font-size:14px;">Subscription Plan</span>
          <span style="color:${BRAND_COLORS.primary}; font-size:14px;">${tierName}</span>
        </div>

        <div style="display:flex; justify-content:space-between; padding:12px 0; border-bottom:1px solid ${BRAND_COLORS.border};">
          <span style="color:${BRAND_COLORS.secondary}; font-size:14px;">Billing Cycle</span>
          <span style="color:${BRAND_COLORS.primary}; font-size:14px;">${billingCycle.charAt(0).toUpperCase() + billingCycle.slice(1)}</span>
        </div>

        <div style="display:flex; justify-content:space-between; padding:12px 0;">
          <span style="color:${BRAND_COLORS.secondary}; font-size:14px;">Payment Method</span>
          <span style="color:${BRAND_COLORS.primary}; font-size:14px;">${paymentMethod}</span>
        </div>

        ${originalAmount && couponCode ? `
        <div style="display:flex; justify-content:space-between; padding:12px 0; border-top:1px solid ${BRAND_COLORS.border};">
          <span style="color:${BRAND_COLORS.secondary}; font-size:14px;">Original Amount</span>
          <span style="color:${BRAND_COLORS.secondary}; font-size:14px; text-decoration:line-through;">${formatAmount(originalAmount, currency)}</span>
        </div>

        <div style="display:flex; justify-content:space-between; padding:12px 0;">
          <span style="color:${BRAND_COLORS.secondary}; font-size:14px;">Discount</span>
          <span style="color:${BRAND_COLORS.primary}; font-size:14px; font-weight:600;">-${formatAmount(originalAmount - amount, currency)} (${discountPercentage}% OFF)</span>
        </div>
        ` : ''}

        <div style="background-color:white; border:2px solid ${BRAND_COLORS.primary}; border-radius:8px; padding:20px; margin-top:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span style="color:${BRAND_COLORS.primary}; font-size:16px; font-weight:700;">Total Paid</span>
            <span style="color:${BRAND_COLORS.success}; font-size:28px; font-weight:800;">${formatAmount(amount, currency)}</span>
          </div>
        </div>
      </div>

      ${selectedGrade || (selectedSubjects && selectedSubjects.length > 0) ? `
      <div style="background-color:white; border:2px solid ${BRAND_COLORS.border}; border-radius:8px; padding:24px; margin:24px 0;">
        <h3 style="margin:0 0 16px 0; color:${BRAND_COLORS.primary}; font-size:16px; font-weight:700;">📚 Your Package</h3>
        ${selectedGrade ? `<p style="margin:0 0 8px 0; font-size:14px;">Grade Level: <strong>${selectedGrade}</strong></p>` : ''}
        ${selectedSubjects && selectedSubjects.length > 0 ? `<p style="margin:0; font-size:14px;">Subjects: <strong>${selectedSubjects.join(', ')}</strong></p>` : ''}
      </div>
      ` : ''}

      <div style="margin:32px 0; padding:24px; background-color:${BRAND_COLORS.lightBackground}; border-left:4px solid ${BRAND_COLORS.primary}; border-radius:4px;">
        <p style="margin:0; font-size:14px; color:${BRAND_COLORS.primary}; line-height:1.6;">
          Your subscription is now active. You have full access to all features included in your plan. If you have any questions, please contact our support team.
        </p>
      </div>

      <div style="text-align:center; margin:32px 0;">
        <a href="${BRAND_INFO.websiteUrl}" style="display:inline-block; background-color:${BRAND_COLORS.primary}; color:white; padding:16px 40px; text-decoration:none; border-radius:8px; font-weight:600;">Access Your Account</a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color:${BRAND_COLORS.lightBackground}; padding:32px 40px; text-align:center; border-top:2px solid ${BRAND_COLORS.border};">
      <p style="margin:0 0 8px 0; color:${BRAND_COLORS.primary}; font-size:16px; font-weight:700;">${BRAND_INFO.companyName}</p>
      <p style="margin:0 0 4px 0; color:${BRAND_COLORS.secondary}; font-size:13px;">This is an automated receipt for your records.</p>
      <p style="margin:0; color:${BRAND_COLORS.secondary}; font-size:12px;">
        If you did not make this purchase, please contact us immediately at 
        <a href="mailto:${BRAND_INFO.supportEmail}" style="color:${BRAND_COLORS.primary}; text-decoration:underline;">${BRAND_INFO.supportEmail}</a>
      </p>
    </div>
  </div>
</body>
</html>
  `.trim()
}
