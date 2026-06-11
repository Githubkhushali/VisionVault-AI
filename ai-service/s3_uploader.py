"""
s3_uploader.py — Phase 6: AWS S3 upload helper
================================================
Reads credentials from environment variables (populated by .env via python-dotenv).
Never hard-code credentials here — keep them in .env (which is .gitignored).
"""

import os
import logging
import boto3
from botocore.exceptions import BotoCoreError, ClientError

logger = logging.getLogger(__name__)


class S3Uploader:
    def __init__(self):
        # Read from environment variables populated by load_dotenv() in app.py
        self.bucket_name = os.getenv("S3_BUCKET_NAME")          # e.g. "visionvault-ai-images"
        self.region      = os.getenv("AWS_REGION", "eu-north-1") # e.g. "eu-north-1"
        access_key       = os.getenv("AWS_ACCESS_KEY_ID")
        secret_key       = os.getenv("AWS_SECRET_ACCESS_KEY")

        if not all([self.bucket_name, self.region, access_key, secret_key]):
            logger.warning(
                "[Phase 6] S3 credentials incomplete — uploads disabled. "
                "Check ai-service/.env has S3_BUCKET_NAME, AWS_REGION, "
                "AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY."
            )
            self.s3 = None
        else:
            self.s3 = boto3.client(
                "s3",
                aws_access_key_id=access_key,
                aws_secret_access_key=secret_key,
                region_name=self.region,
            )
            logger.info(
                f"[Phase 6] S3Uploader ready. Bucket={self.bucket_name}, Region={self.region}"
            )

    @property
    def available(self) -> bool:
        return self.s3 is not None

    def upload_file(self, local_path: str, s3_key: str) -> str | None:
        """Upload a file from disk. Returns the public HTTPS URL or None on failure."""
        if not self.available:
            return None
        try:
            self.s3.upload_file(
                local_path,
                self.bucket_name,
                s3_key,
                ExtraArgs={"ContentType": _guess_content_type(local_path)},
            )
            url = f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{s3_key}"
            logger.info(f"[Phase 6] Uploaded {local_path} → {url}")
            return url
        except (BotoCoreError, ClientError) as e:
            logger.error(f"[Phase 6] Upload failed for {local_path}: {e}")
            return None

    def upload_bytes(self, data: bytes, s3_key: str, content_type: str = "image/jpeg") -> str | None:
        """Upload raw bytes (e.g. an in-memory JPEG frame). Returns URL or None."""
        if not self.available:
            return None
        try:
            self.s3.put_object(
                Bucket=self.bucket_name,
                Key=s3_key,
                Body=data,
                ContentType=content_type,
            )
            url = f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{s3_key}"
            logger.info(f"[Phase 6] Uploaded bytes → {url}")
            return url
        except (BotoCoreError, ClientError) as e:
            logger.error(f"[Phase 6] Byte upload failed for {s3_key}: {e}")
            return None


def _guess_content_type(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    return {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
    }.get(ext, "application/octet-stream")