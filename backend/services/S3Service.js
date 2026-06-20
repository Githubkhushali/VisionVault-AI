const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const dotenv = require("dotenv");
dotenv.config();

class S3Service {
  constructor() {
    this.bucketName = process.env.S3_BUCKET_NAME;
    this.region = process.env.AWS_REGION || "eu-north-1";
    this.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    this.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (this.bucketName && this.accessKeyId && this.secretAccessKey) {
      this.s3 = new S3Client({
        region: this.region,
        credentials: {
          accessKeyId: this.accessKeyId,
          secretAccessKey: this.secretAccessKey,
        },
      });
      this.isAvailable = true;
      console.log(`[S3Service] Ready for bucket: ${this.bucketName} (${this.region})`);
    } else {
      this.s3 = null;
      this.isAvailable = false;
      console.warn("[S3Service] Credentials missing. Uploads disabled.");
    }
  }

  /**
   * Upload JSON session payload to S3
   */
  /**
   * Upload a file buffer to a user-scoped S3 folder.
   * Key format: user_{userId}/{subFolder}/{filename}
   */
  async uploadFile(fileBuffer, fileName, mimeType, userId = 'shared', subFolder = 'uploads') {
    if (!this.isAvailable) {
      console.warn('[S3Service] S3 not configured. Skipping upload.');
      return null;
    }
    try {
      const s3Key = `user_${userId}/${subFolder}/${Date.now()}-${fileName}`;
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: fileBuffer,
        ContentType: mimeType,
      });
      await this.s3.send(command);
      const s3Url = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${s3Key}`;
      console.log(`[S3Service] File uploaded: ${s3Url}`);
      return s3Url;
    } catch (error) {
      console.error('[S3Service] Failed to upload file:', error.message);
      throw error;
    }
  }

  /**
   * Upload JSON session log to user-scoped S3 folder.
   * Legacy: uploadSessionLog(logData, sessionId) — userId optional for backward compat
   */
  async uploadSessionLog(logData, sessionId, userId = 'shared') {
    if (!this.isAvailable) {
      console.warn('[S3Service] S3 not configured. Skipping session log upload.');
      return null;
    }

    try {
      const s3Key = `user_${userId}/sessions/${sessionId}.json`;
      const jsonString = JSON.stringify(logData, null, 2);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: Buffer.from(jsonString, 'utf-8'),
        ContentType: 'application/json',
      });

      await this.s3.send(command);
      
      const s3Url = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${s3Key}`;
      console.log(`[S3Service] Session log uploaded: ${s3Url}`);
      return s3Url;
    } catch (error) {
      console.error('[S3Service] Failed to upload session log:', error.message);
      throw error;
    }
  }

  /**
   * Generates a pre-signed URL for an existing S3 URL if S3 is configured.
   * If S3 is not configured or the URL is not a valid S3 URL, returns the original URL.
   */
  async getPresignedUrl(s3Url, expiresIn = 3600) {
    if (!this.isAvailable || !s3Url || typeof s3Url !== 'string') {
      return s3Url;
    }

    try {
      if (!s3Url.includes("amazonaws.com") && !s3Url.includes(this.bucketName)) {
        return s3Url;
      }

      const { GetObjectCommand } = require("@aws-sdk/client-s3");
      const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

      const urlObj = new URL(s3Url);
      let bucket = this.bucketName;
      let s3Key = decodeURIComponent(urlObj.pathname.slice(1));

      const hostParts = urlObj.hostname.split(".");
      if (hostParts.length > 2 && hostParts[1] === "s3") {
        bucket = hostParts[0];
      }

      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: s3Key,
      });

      const signedUrl = await getSignedUrl(this.s3, command, { expiresIn });
      return signedUrl;
    } catch (error) {
      console.error("[S3Service] Failed to generate pre-signed URL for:", s3Url, error.message);
      return s3Url;
    }
  }
}

module.exports = new S3Service();
