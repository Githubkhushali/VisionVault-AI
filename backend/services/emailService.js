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

module.exports = {
  sendUnknownPersonAlert,
};
