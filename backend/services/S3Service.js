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
  async uploadSessionLog(logData, sessionId) {
    if (!this.isAvailable) {
      console.warn("[S3Service] S3 not configured. Skipping session log upload.");
      return null;
    }

    try {
      const s3Key = `sessions/logs/${sessionId}.json`;
      const jsonString = JSON.stringify(logData, null, 2);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: Buffer.from(jsonString, 'utf-8'),
        ContentType: "application/json",
      });

      await this.s3.send(command);
      
      const s3Url = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${s3Key}`;
      console.log(`[S3Service] Session log uploaded successfully: ${s3Url}`);
      return s3Url;
    } catch (error) {
      console.error("[S3Service] Failed to upload session log:", error.message);
      throw error;
    }
  }
}

module.exports = new S3Service();
