const BREVO_SEND_EMAIL_URL = "https://api.brevo.com/v3/smtp/email";
const DEFAULT_SITE_URL = "https://www.sidrastore.in";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getBrevoConfiguration() {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  const senderName = process.env.BREVO_SENDER_NAME;

  if (!apiKey || !senderEmail || !senderName) {
    throw new Error("Brevo email configuration is incomplete.");
  }

  return { apiKey, senderEmail, senderName };
}

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE_URL).replace(/\/+$/, "");
}

function buildOtpEmailHtml({ name, code, actionLabel, siteUrl }) {
  const logoUrl = `${siteUrl}/images/logo.png`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Sidra Store verification code</title>
  </head>
  <body style="margin:0;padding:0;background-color:#f6f2ea;color:#172533;font-family:Arial,Helvetica,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Your Sidra Store verification code is ${code}.</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#f6f2ea;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border:1px solid #e8dfd1;border-radius:18px;overflow:hidden;">
            <tr>
              <td align="center" style="padding:28px 24px 22px;border-bottom:1px solid #eee7dc;">
                <a href="${siteUrl}" target="_blank" style="text-decoration:none;">
                  <img src="${logoUrl}" width="170" alt="Sidra Store" style="display:block;width:170px;max-width:70%;height:auto;border:0;">
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:36px 40px 32px;">
                <p style="margin:0 0 10px;color:#b3833c;font-size:12px;font-weight:700;letter-spacing:1.8px;line-height:18px;text-transform:uppercase;">Secure email verification</p>
                <h1 style="margin:0 0 18px;color:#172533;font-size:28px;font-weight:700;line-height:36px;">Verify your Sidra Store account</h1>
                <p style="margin:0 0 18px;color:#4c5660;font-size:16px;line-height:26px;">Hello ${name},</p>
                <p style="margin:0 0 24px;color:#4c5660;font-size:16px;line-height:26px;">Use the verification code below to ${actionLabel}. This code is valid for 10 minutes.</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 24px;">
                  <tr>
                    <td align="center" style="padding:22px 16px;background-color:#fbf7ef;border:1px solid #ead9b9;border-radius:12px;">
                      <span style="color:#172533;font-size:34px;font-weight:700;letter-spacing:10px;line-height:42px;">${code}</span>
                    </td>
                  </tr>
                </table>
                <p style="margin:0;color:#7a838b;font-size:13px;line-height:21px;">If you did not request this code, you can safely ignore this email. For your security, never share this code with anyone.</p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 24px;background-color:#172533;">
                <p style="margin:0 0 6px;color:#ffffff;font-size:13px;line-height:20px;">Authentic products. Thoughtful service.</p>
                <a href="${siteUrl}" target="_blank" style="color:#e8bd6d;font-size:12px;line-height:18px;text-decoration:none;">Visit sidrastore.in</a>
              </td>
            </tr>
          </table>
          <p style="margin:18px 0 0;color:#8a8f94;font-size:12px;line-height:18px;">© 2026 Sidra Store. This is an automated security email.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function sendOtpEmail({ email, fullName, code, intent }) {
  const { apiKey, senderEmail, senderName } = getBrevoConfiguration();
  const safeName = escapeHtml(fullName || "there");
  const siteUrl = getSiteUrl();
  const actionLabel = intent === "register" ? "complete your registration" : "sign in to your account";
  const payload = {
    sender: { email: senderEmail, name: senderName },
    to: [{ email, name: fullName || email }],
    subject: "Your Sidra Store verification code",
    textContent: `Hello ${fullName || "there"}, use the Sidra Store verification code ${code} to ${actionLabel}. This code expires in 10 minutes. If you did not request this code, you can safely ignore this email. Never share this code with anyone.`,
    htmlContent: buildOtpEmailHtml({ name: safeName, code, actionLabel, siteUrl }),
  };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(BREVO_SEND_EMAIL_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (response.ok) return;

    const responseBody = await response.text();
    const shouldRetry = attempt === 0 && (response.status === 429 || response.status >= 500);
    if (shouldRetry) {
      await wait(250);
      continue;
    }

    throw new Error(`Brevo email request failed with status ${response.status}: ${responseBody.slice(0, 500)}`);
  }
}
