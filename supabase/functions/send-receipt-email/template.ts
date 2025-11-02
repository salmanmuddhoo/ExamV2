export function generateReceiptHTML(data) {
  const { transactionId, userName, amount, currency, tierName, billingCycle, paymentMethod, transactionDate, selectedGrade, selectedSubjects, couponCode, discountPercentage, originalAmount } = data;
  const formattedDate = new Date(transactionDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  const formatAmount = (amt, curr)=>{
    if (curr === 'MUR') return `Rs ${amt.toLocaleString()}`;
    return `$${amt.toFixed(2)}`;
  };
  const BRAND = {
    primary: '#000000',
    text: '#111827',
    secondary: '#6b7280',
    border: '#e5e7eb',
    background: '#ffffff',
    light: '#f9fafb',
    gradientDark: '#4b5563',
    gradientLight: '#9ca3af',
    company: 'AixamPapers',
    email: 'support@aixampapers.com',
    url: 'https://aixampapers.com/'
  };
  const Row = (label, value, noBorder = false)=>`
    <tr>
      <td style="padding:10px 0;color:${BRAND.secondary};font-size:14px;">${label}</td>
      <td style="padding:10px 0;color:${BRAND.text};font-size:14px;text-align:right;font-weight:500;">${value}</td>
    </tr>
    ${noBorder ? '' : `<tr><td colspan="2" style="border-bottom:1px solid ${BRAND.border};"></td></tr>`}
  `;
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#f3f4f6;">

<div style="max-width:650px;margin:40px auto;background:${BRAND.background};border:1px solid ${BRAND.border};border-radius:12px;overflow:hidden;">

  <!-- Header -->
  <div style="background:linear-gradient(135deg,${BRAND.gradientDark},${BRAND.gradientLight});padding:45px;text-align:center;color:white;">
    <h1 style="margin:0;font-size:30px;font-weight:700;">Payment Receipt</h1>
    <p style="margin-top:8px;font-size:15px;opacity:.9;">Thank you for your payment</p>
  </div>

  <!-- Body -->
  <div style="padding:40px;">
    <p style="font-size:18px;color:${BRAND.text};font-weight:600;margin:0 0 12px;">Hi ${userName},</p>
    <p style="font-size:15px;color:${BRAND.secondary};line-height:1.6;margin:0;">
      Your subscription to <strong>${BRAND.company}</strong> is now active. Below is your payment receipt.
    </p>

    <!-- Transaction Box -->
    <div style="margin:28px 0;padding:24px;border:1px solid ${BRAND.border};border-radius:10px;background:${BRAND.light};">
      <h3 style="margin:0 0 20px;font-size:16px;font-weight:700;color:${BRAND.primary};text-transform:uppercase;">Transaction Details</h3>
      <table style="width:100%;border-collapse:collapse;">
        ${Row("Transaction ID", `${transactionId.substring(0, 20)}...`)}
        ${Row("Date", formattedDate)}
        ${Row("Plan", tierName)}
        ${Row("Billing Cycle", billingCycle[0].toUpperCase() + billingCycle.slice(1))}
        ${Row("Payment Method", paymentMethod, true)}
      </table>

      ${originalAmount && couponCode ? `
            <div style="margin-top:15px;padding-top:15px;border-top:1px solid ${BRAND.border};">
              ${Row("Original Amount", `<span style='text-decoration:line-through;'>${formatAmount(originalAmount, currency)}</span>`, true)}
              ${Row("Discount Applied", `-${formatAmount(originalAmount - amount, currency)} (${discountPercentage}% OFF)`, true)}
            </div>
          ` : ""}

      <div style="margin-top:22px;padding:18px;border-radius:8px;border:2px solid ${BRAND.primary};background:white;text-align:right;">
        <span style="font-size:16px;font-weight:700;color:${BRAND.text};float:left;">Total Paid</span>
        <span style="font-size:28px;font-weight:800;color:${BRAND.primary};">${formatAmount(amount, currency)}</span>
      </div>
    </div>

    ${selectedGrade || selectedSubjects?.length > 0 ? `
        <div style="background:white;border:1px solid ${BRAND.border};border-radius:8px;padding:20px;margin:20px 0;">
          <h4 style="margin:0 0 12px;font-size:16px;font-weight:700;color:${BRAND.primary};">📚 Your Package</h4>
          ${selectedGrade ? `<p style="margin:0;font-size:14px;">Grade: <b>${selectedGrade}</b></p>` : ""}
          ${selectedSubjects?.length ? `<p style="margin:6px 0 0;font-size:14px;">Subjects: <b>${selectedSubjects.join(", ")}</b></p>` : ""}
        </div>
      ` : ""}

    <p style="background:${BRAND.light};padding:18px;border-left:4px solid ${BRAND.primary};font-size:14px;color:${BRAND.text};line-height:1.6;margin:30px 0;">
      Your subscription is now active. If you have any questions, reply to this email — we're here to help.
    </p>

    <div style="text-align:center;margin:30px 0;">
      <a href="${BRAND.url}" style="background:${BRAND.primary};color:white;padding:14px 35px;border-radius:8px;font-weight:600;text-decoration:none;font-size:15px;">
        Access Your Account
      </a>
    </div>
  </div>

  <!-- Footer -->
  <div style="background:${BRAND.light};padding:28px;text-align:center;border-top:1px solid ${BRAND.border};">
    <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:${BRAND.text};">${BRAND.company}</p>
    <p style="margin:0;color:${BRAND.secondary};font-size:13px;">This receipt is automatically generated.</p>
    <p style="margin:6px 0 0;color:${BRAND.secondary};font-size:12px;">
      Need help? Contact <a href="mailto:${BRAND.email}" style="color:${BRAND.primary};text-decoration:underline;">${BRAND.email}</a>
    </p>
  </div>

</div>

</body>
</html>
  `;
}
