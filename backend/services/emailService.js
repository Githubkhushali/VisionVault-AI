const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

let sesClient = null;

const initSESClient = () => {
  if (!sesClient && process.env.AWS_REGION && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    sesClient = new SESClient({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    });
  }
  return sesClient;
};

/**
 * Send an email using AWS SES.
 */
const sendUnknownPersonAlert = async (s3Url) => {
  const client = initSESClient();
  const fromEmail = process.env.SES_FROM_EMAIL;
  const toEmail = process.env.SES_TO_EMAIL;

  if (!client || !fromEmail || !toEmail) {
    console.warn("[EmailService] AWS SES not fully configured or missing FROM/TO emails. Skipping email alert.");
    return false;
  }

  // Pre-sign the image URL so that email recipients can view it even if the S3 bucket is private
  let signedUrl = s3Url;
  try {
    const s3Service = require('./S3Service');
    signedUrl = await s3Service.getPresignedUrl(s3Url, 604800); // 7 days expiry
  } catch (err) {
    console.error("[EmailService] Failed to sign alert S3 URL:", err.message);
  }

  const timestamp = new Date().toLocaleString();
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; color: #333;">
      <h2 style="color: #d9534f;">⚠ Unknown Person Detected</h2>
      <p>VisionVault-AI detected an unknown person.</p>
      <ul>
        <li><strong>Timestamp:</strong> ${timestamp}</li>
        <li><strong>Camera:</strong> Live Stream</li>
      </ul>
      <p>Image location:</p>
      <a href="${signedUrl}" style="display:inline-block; padding:10px 15px; background-color:#007bff; color:#fff; text-decoration:none; border-radius:5px;">View S3 Image</a>
    </div>
  `;

  const textBody = `
    ⚠ Unknown Person Detected
    VisionVault-AI detected an unknown person.
    Timestamp: ${timestamp}
    Camera: Live Stream
    Image location: ${signedUrl}
  `;

  try {
    const command = new SendEmailCommand({
      Source: fromEmail,
      Destination: {
        ToAddresses: [toEmail],
      },
      Message: {
        Subject: {
          Data: "⚠ Unknown Person Detected - VisionVault-AI",
        },
        Body: {
          Html: { Data: htmlBody },
          Text: { Data: textBody },
        },
      },
    });

    const response = await client.send(command);
    console.log(`[EmailService] SES alert sent successfully. MessageId: ${response.MessageId}`);
    return true;
  } catch (error) {
    console.error(`[EmailService] Failed to send SES email: ${error.message}`);
    return false;
  }
};

/**
 * Send a password reset email using AWS SES.
 */
const sendPasswordResetEmail = async (toEmail, userName, resetUrl) => {
  const client = initSESClient();
  const fromEmail = process.env.SES_FROM_EMAIL;

  if (!client || !fromEmail) {
    console.warn('[EmailService] SES not configured — skipping password reset email. Reset URL logged to console.');
    return false;
  }

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; background:#0c0c0c; color:#e3e3cb; padding:32px; border-radius:8px;">
      <h2 style="color:#e3e3cb; margin-bottom:8px;">🔐 VisionVault Password Reset</h2>
      <p style="color:#a1a1aa;">Hi ${userName},</p>
      <p style="color:#a1a1aa;">We received a request to reset your VisionVault account password. Click the button below to create a new password.</p>
      <a href="${resetUrl}" style="display:inline-block; margin:24px 0; padding:14px 28px; background:#e3e3cb; color:#0c0c0c; text-decoration:none; border-radius:4px; font-weight:bold; font-family:monospace;">RESET MY PASSWORD</a>
      <p style="color:#71717a; font-size:12px;">This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.</p>
      <p style="color:#71717a; font-size:12px;">— VisionVault-AI Security Team</p>
    </div>
  `;

  const textBody = `VisionVault Password Reset\n\nHi ${userName},\n\nClick the link below to reset your password (expires in 1 hour):\n\n${resetUrl}\n\nIf you did not request this, ignore this email.`;

  try {
    const command = new SendEmailCommand({
      Source: fromEmail,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: { Data: '🔐 VisionVault — Password Reset Request' },
        Body: {
          Html: { Data: htmlBody },
          Text: { Data: textBody },
        },
      },
    });
    const response = await client.send(command);
    console.log(`[EmailService] Password reset email sent. MessageId: ${response.MessageId}`);
    return true;
  } catch (error) {
    console.error(`[EmailService] Failed to send password reset email: ${error.message}`);
    return false;
  }
};

module.exports = {
  sendUnknownPersonAlert,
  sendPasswordResetEmail,
};
