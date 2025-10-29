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
  } = data;

  const formattedDate = new Date(transactionDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const formatAmount = (amt: number, curr: string) => {
    if (curr === 'MUR') return `Rs ${amt.toLocaleString()}`;
    return `$${amt.toFixed(2)}`;
  };

  const BRAND_COLORS = {
    primary: '#000000',
    secondary: '#6b7280',
    border: '#e5e7eb',
    background: '#ffffff',
    lightBackground: '#f9fafb',
    success: '#000000',
    gradientDark: '#4b5563',
    gradientLight: '#9ca3af'
  };

  const BRAND_INFO = {
    companyName: 'ExamV2',
    supportEmail: 'support@examv2.com',
    websiteUrl: 'https://exam-v2.vercel.app'
  };

  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Payment Receipt</title>
</head>
<body style="margin:0; padding:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif; background-color:#f3f4f6;">

  <div style="max-width:650px; margin:40px auto; background-color:${BRAND_COLORS.background}; border:2px solid ${BRAND_COLORS.border}; border-radius:12px; overflow:hidden;">

    <!-- Header -->
    <div style="background: linear-gradient(135deg, ${BRAND_COLORS.gradientDark} 0%, ${BRAND_COLORS.gradientLight} 100%); color:white; padding:48px 40px; text-align:center; border-bottom:2px solid ${BRAND_COLORS.border};">
      <h1 style="margin:0 0 12px 0; font-size:32px; font-weight:700;">Payment Receipt</h1>
      <p style="margin:0; font-size:16px; opacity:0.9;">Thank you for your purchase</p>
    </div>

    <!-- Body -->
    <div style="padding:48px 40px;">
      <p style="margin:0 0 16px 0; font-size:18px; color:${BRAND_COLORS.primary}; font-weight:600;">Hi ${userName},</p>
      <p style="margin:0; font-size:15px; color:${BRAND_COLORS.secondary}; line-height:1.6;">
        Thank you for subscribing to ${BRAND_INFO.companyName}. Your payment has been successfully processed and your subscription is now active.
      </p>

      <!-- Transaction Details Table -->
      <table style="width:100%; margin:32px 0; border-collapse:collapse; background-color:${BRAND_COLORS.lightBackground}; border:2px solid ${BRAND_COLORS.border}; border-radius:8px;">
        <thead>
          <tr>
            <th colspan="2" style="padding:16px; text-align:left; color:${BRAND_COLORS.primary}; font-size:18px; font-weight:700; text-transform:uppercase; border-bottom:2px solid ${BRAND_COLORS.border};">Transaction Details</th>
          </tr>
        </thead>
        <tbody style="font-size:14px; color:${BRAND_COLORS.primary};">
          <tr>
            <td style="padding:12px; color:${BRAND_COLORS.secondary};">Transaction ID</td>
            <td style="padding:12px; text-align:right; font-family:'Courier New', monospace;">${transactionId.substring(0,20)}...</td>
          </tr>
          <tr style="border-top:1px solid ${BRAND_COLORS.border};">
            <td style="padding:12px; color:${BRAND_COLORS.secondary};">Date</td>
            <td style="padding:12px; text-align:right;">${formattedDate}</td>
          </tr>
          <tr style="border-top:1px solid ${BRAND_COLORS.border};">
            <td style="padding:12px; color:${BRAND_COLORS.secondary};">Subscription Plan</td>
            <td style="padding:12px; text-align:right;">${tierName}</td>
          </tr>
          <tr style="border-top:1px solid ${BRAND_COLORS.border};">
            <td style="padding:12px; color:${BRAND_COLORS.secondary};">Billing Cycle</td>
            <td style="padding:12px; text-align:right;">${billingCycle.charAt(0).toUpperCase() + billingCycle.slice(1)}</td>
          </tr>
          <tr style="border-top:1px solid ${BRAND_COLORS.border};">
            <td style="padding:12px; color:${BRAND_COLORS.secondary};">Payment Method</td>
            <td style="padding:12px; text-align:right;">${paymentMethod}</td>
          </tr>
          ${originalAmount && couponCode ? `
          <tr style="border-top:1px solid ${BRAND_COLORS.border};">
            <td style="padding:12px; color:${BRAND_COLORS.secondary};">Original Amount</td>
            <td style="padding:12px; text-align:right; color:${BRAND_COLORS.secondary}; text-decoration:line-through;">${formatAmount(originalAmount, currency)}</td>
          </tr>
          <tr>
            <td style="padding:12px; color:${BRAND_COLORS.secondary};">Discount</td>
            <td style="padding:12px; text-align:right; font-weight:600;">-${formatAmount(originalAmount - amount, currency)} (${discountPercentage}% OFF)</td>
          </tr>` : ''}
          <tr>
            <td colspan="2" style="padding:16px; border-top:2px solid ${BRAND_COLORS.primary}; background:white; font-weight:700; font-size:16px;">
              <table style="width:100%; border-collapse:collapse;">
                <tr>
                  <td>Total Paid</td>
                  <td style="text-align:right; font-size:28px; color:${BRAND_COLORS.success}; font-weight:800;">${formatAmount(amount, currency)}</td>
                </tr>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      ${selectedGrade || (selectedSubjects && selectedSubjects.length > 0) ? `
      <div style="background-color:white; border:2px solid ${BRAND_COLORS.border}; border-radius:8px; padding:24px; margin:24px 0;">
        <h3 style="margin:0 0 16px 0; color:${BRAND_COLORS.primary}; font-size:16px; font-weight:700;">📚 Your Package</h3>
        ${selectedGrade ? `<p style="margin:0 0 8px 0; font-size:14px;">Grade Level: <strong>${selectedGrade}</strong></p>` : ''}
        ${selectedSubjects && selectedSubjects.length > 0 ? `<p style="margin:0; font-size:14px;">Subjects: <strong>${selectedSubjects.join(', ')}</strong></p>` : ''}
      </div>` : ''}

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
`.trim();
}
