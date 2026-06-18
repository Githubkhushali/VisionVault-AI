require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const db = require("./db-postgres");
const notificationService = require("./services/notificationService");
const emailService = require("./services/emailService");

// ── App Setup ─────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 5005;

app.use(cors());
app.use(express.json());

// ── Mount Modular Routes ──────────────────────────────────────
const liveStreamRoutes = require('./routes/liveStream');
const historyRoutes = require('./routes/history');
const authRoutes = require('./routes/auth');
const usersRoutes = require('./routes/users');
const notificationsRoutes = require('./routes/notifications');
const settingsRoutes = require('./routes/settings');
const smsRoutes = require('./routes/sms');

app.use('/api', liveStreamRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/send-sms', smsRoutes);


// ── Live Stream Memory Logs (Moved to LiveStreamService) ────────

// ── Multer — store uploads to /uploads folder temporarily ─────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max
});

// ── Route: Process Continuous Live Streams (Moved to LiveStreamController) ──

// ── AWS S3 Client ─────────────────────────────────────────────
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const deleteTempFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error("Error deleting temp file:", err.message);
  }
};

const uploadToS3 = async (filePath, fileName, mimeType) => {
  const fileStream = fs.createReadStream(filePath);
  const s3Key = `visionvault/${Date.now()}-${fileName}`;
  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET_NAME,
    Key: s3Key,
    Body: fileStream,
    ContentType: mimeType,
  });
  await s3.send(command);
  return `https://${process.env.S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;
};

// ── Helper: Call Local YOLO API for Images ────────────────────
const detectPeopleWithYOLO = async (filePath) => {
  try {
    const formData = new FormData();
    const fileBlob = await fs.openAsBlob(filePath);
    formData.append("image", fileBlob, path.basename(filePath));

    console.log(`[YOLO] Sending image to http://127.0.0.1:5002/detect-image...`);
    const response = await fetch("http://127.0.0.1:5002/detect-image", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) throw new Error(`YOLO API Error: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.error("[YOLO Service Error]", error.message);
    return { personDetected: false, personCount: 0 };
  }
};

// ── Helper: Call Local YOLO API for Videos ────────────────────
const detectVideoWithYOLO = async (filePath) => {
  try {
    const formData = new FormData();
    const fileBlob = await fs.openAsBlob(filePath);
    formData.append("video", fileBlob, path.basename(filePath));

    console.log(`[YOLO] Sending video to http://127.0.0.1:5002/detect-video...`);
    const response = await fetch("http://127.0.0.1:5002/detect-video", {
      method: "POST",
      body: formData,
    });
    if (!response.ok) throw new Error(`YOLO API Error: ${response.statusText}`);
    return await response.json();
  } catch (error) {
    console.error("[YOLO Video Service Error]", error.message);
    return { personDetected: false, personCount: 0 };
  }
};

// ── Route: Health Check ───────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "VisionVault-AI backend is running with YOLO 🚀" });
});

// ── Route: Register a name for a detected identity ────────────
app.post("/api/register-name", async (req, res) => {
  const { identityId, name } = req.body;
  if (!identityId || !name) {
    return res.status(400).json({ error: "identityId and name are required" });
  }
  try {
    const response = await fetch("http://127.0.0.1:5002/register-name", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identityId, name }),
    });
    const data = await response.json();
    res.status(response.ok ? 200 : 500).json(data);
  } catch (err) {
    console.error("[register-name error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Route: Get movement events (name + entry/exit counts) ─────
app.get("/api/movements", async (req, res) => {
  try {
    const response = await fetch("http://127.0.0.1:5002/movements");
    const data = await response.json();
    res.status(response.ok ? 200 : 500).json(data);
  } catch (err) {
    console.error("[movements error]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Route: Upload Image ───────────────────────────────────────
app.post("/api/upload", upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "No image file provided." });

  const filePath = req.file.path;
  const fileName = req.file.filename;
  const mimeType = req.file.mimetype;

  console.log(`[Upload] Received image: ${fileName}`);

  try {
    // 1. Upload to S3 (used as fallback or main image URL)
    const s3Url = await uploadToS3(filePath, fileName, mimeType);

    // 2. Call YOLO for person counting and face analysis
    const yoloResult = await detectPeopleWithYOLO(filePath);
    deleteTempFile(filePath);

    const sessionId = `img_${Date.now()}`;
    const personCount = yoloResult.personCount || 0;
    const facesDetected = yoloResult.facesDetected || 0;
    const uniqueIdentities = yoloResult.uniqueIdentities || 0;
    const averageConfidence = yoloResult.averageConfidence || 0;
    const imageS3Url = yoloResult.imageS3Url || s3Url;

    // Save session metadata to PostgreSQL
    await db.run(
      `INSERT INTO sessions (id, filename, type, s3_url, total_frames, people_count, face_count, unique_identities_count, average_confidence) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)`,
      [
        sessionId,
        req.file.originalname,
        "image",
        imageS3Url,
        personCount,
        facesDetected,
        uniqueIdentities,
        averageConfidence
      ]
    );

    const faces = [];
    if (Array.isArray(yoloResult.faces)) {
      for (let i = 0; i < yoloResult.faces.length; i++) {
        const p = yoloResult.faces[i];
        const trackId = p.personIndex;
        const faceConf = p.faceConf || 0;
        const faceCount = p.faceCount || 0;

        let s3CropUrl = null;
        let identityId = null;
        if (Array.isArray(p.faces) && p.faces.length > 0) {
          s3CropUrl = p.faces[0].s3CropUrl || null;
          identityId = p.faces[0].identityId || null;
        }

        if (identityId && p.bbox) {
          const trackerResult = liveTracker.evaluate(
            identityId,
            p.bbox
          );

          console.log(
            `[Tracker] ${identityId} -> ${trackerResult.event}`
          );
        }

        if (identityId) {
          recordFaceAppearance(identityId, s3CropUrl || imageS3Url);
          
          // Check for UNKNOWN_PERSON if cosine distance/confidence implies unknown
          // or if identityId falls under unknown prefix (depending on AI service mapping).
          // We assume identityId is 'Unknown' or similar if not found, or conf < threshold
          const threshold = 0.65; // This could come from Settings later
          const isUnknown = faceConf < threshold || identityId.includes('Unknown') || legacyId.includes('fallback');
          
          if (isUnknown) {
            notificationService.createNotification(
              'UNKNOWN_PERSON', 
              'Unknown Person Detected (Image)', 
              `An unknown person was detected in uploaded image: ${fileName}`, 
              'HIGH'
            );
            // Send SES email
            if (emailService) {
              emailService.sendUnknownPersonAlert(s3CropUrl || imageS3Url);
            }
          }
        }

        await db.run(
          `INSERT INTO session_people (session_id, track_id, average_confidence, face_count, best_face_confidence, identity_id, s3_crop_url, frames_appeared, reentries) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)`,
          [sessionId, trackId, faceConf, faceCount, faceConf, identityId, s3CropUrl]
        );

        let isNew = true;
        let uploadCount = 1;

        if (identityId) {
          const existingIdentity = await db.get(`SELECT id, total_appearances FROM identities WHERE id = ?`, [identityId]);
          if (!existingIdentity) {
            await db.run(
              `INSERT INTO identities (id, canonical_face_url, total_appearances) VALUES (?, ?, 1)`,
              [identityId, s3CropUrl]
            );
          } else {
            isNew = false;
            uploadCount = existingIdentity.total_appearances + 1;
            await db.run(
              `UPDATE identities SET last_seen = CURRENT_TIMESTAMP, total_appearances = total_appearances + 1 WHERE id = ?`,
              [identityId]
            );
          }
        }

        const legacyId = `yolo_${Date.now()}_${i}`;
        faces.push({
          id: legacyId,
          faceIndex: i,
          isNew,
          confidence: Math.round(faceConf * 100) || 99,
          uploadCount,
          s3Url: s3CropUrl || imageS3Url,
          identityId: identityId || legacyId
        });

        // Insert into legacy table detected_faces for backward compatibility
        await db.run(
          `INSERT INTO detected_faces (id, face_signature, upload_count, s3_url) VALUES (?, ?, ?, ?)`,
          [legacyId, identityId || "YOLO Detection", uploadCount, s3CropUrl || imageS3Url]
        );
      }
    } else if (yoloResult.personDetected) {
      // Fallback if faces array isn't populated
      for (let i = 0; i < yoloResult.personCount; i++) {
        const id = `yolo_${Date.now()}_${i}`;
        faces.push({
          id,
          faceIndex: i,
          isNew: true,
          confidence: 99,
          uploadCount: 1,
          s3Url: imageS3Url,
          identityId: `id_fallback_${i}`
        });

        await db.run(
          `INSERT INTO detected_faces (id, face_signature, upload_count, s3_url) VALUES (?, ?, 1, ?)`,
          [id, "YOLO Detection", imageS3Url]
        );
      }
    }

    notificationService.createNotification(
      'UPLOAD_COMPLETE',
      'Image Analysis Complete',
      `Processed image ${fileName}. Found ${yoloResult.personCount} people and ${facesDetected} faces.`,
      'INFO'
    );

    return res.status(200).json({
      success: true,
      sessionId,
      humanDetected: yoloResult.personDetected,
      humanCount: yoloResult.personCount,
      averageConfidence: yoloResult.averageConfidence ?? null,
      confidenceScores: yoloResult.confidenceScores ?? [],
      faces: faces,
      message: `YOLO detected ${yoloResult.personCount} people and ${facesDetected} faces.`,
      s3Url: imageS3Url,
    });

  } catch (error) {
    deleteTempFile(filePath);
    console.error("[Error]", error.message);
    return res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});


// ── Virtual Threshold Line Tracker & Routes (Moved to Service/Controller) ──


// ── Route: Upload Video ───────────────────────────────────────
app.post("/api/upload-video", upload.single("video"), async (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: "No video file provided." });

  const filePath = req.file.path;
  console.log(`[Video Upload] Processing video: ${req.file.filename}`);

  try {
    // 1. Call YOLO video tracker directly on the .mp4 file
    const yoloResult = await detectVideoWithYOLO(filePath);
    deleteTempFile(filePath);

    const sessionId = `vid_${Date.now()}`;
    const totalFrames = yoloResult.totalFrames || 0;
    const personCount = yoloResult.uniquePeople || yoloResult.personCount || 0;
    const averageConfidence = yoloResult.averageConfidence || 0;
    const facesDetected = yoloResult.facesDetected || 0;
    const uniqueIdentities = yoloResult.uniqueIdentities || 0;
    const videoS3Url = yoloResult.videoS3Url || "";

    // Save session metadata to PostgreSQL
    await db.run(
      `INSERT INTO sessions (id, filename, type, s3_url, total_frames, people_count, face_count, unique_identities_count, average_confidence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        req.file.originalname,
        "video",
        videoS3Url,
        totalFrames,
        personCount,
        facesDetected,
        uniqueIdentities,
        averageConfidence
      ]
    );

    const facesRegistered = [];
    const facesRecognized = [];
    const faceSnapshots = [];

    // Save each tracked person and face snapshot to PostgreSQL
    if (Array.isArray(yoloResult.people)) {
      for (const p of yoloResult.people) {
        const trackId = p.id;
        const avgConf = p.avgConfidence || 0;
        const faceCount = p.faceCount || 0;
        const bestFaceConf = p.bestFaceConf || 0;
        const identityId = p.identityId;
        const s3CropUrl = p.s3CropUrl;
        const framesAppeared = p.framesAppeared || 1;
        const reentries = p.reentries || 0;

        await db.run(
          `INSERT INTO session_people (session_id, track_id, average_confidence, face_count, best_face_confidence, identity_id, s3_crop_url, frames_appeared, reentries) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [sessionId, trackId, avgConf, faceCount, bestFaceConf, identityId, s3CropUrl, framesAppeared, reentries]
        );

        if (identityId) {
          const existingIdentity = await db.get(`SELECT id FROM identities WHERE id = ?`, [identityId]);
          let isNew = false;
          if (!existingIdentity) {
            isNew = true;
            await db.run(
              `INSERT INTO identities (id, canonical_face_url, total_appearances) VALUES (?, ?, 1)`,
              [identityId, s3CropUrl]
            );
          } else {
            await db.run(
              `UPDATE identities SET last_seen = CURRENT_TIMESTAMP, total_appearances = total_appearances + 1 WHERE id = ?`,
              [identityId]
            );
          }

          if (s3CropUrl) {
            faceSnapshots.push({
              id: `${identityId}_${Date.now()}`,
              s3Url: s3CropUrl
            });

            if (isNew) {
              facesRegistered.push(identityId);
            } else {
              facesRecognized.push(identityId);
            }
          }
          
          const threshold = 0.65;
          const isUnknown = avgConf < threshold || identityId.includes('Unknown') || identityId.includes('fallback');
          if (isUnknown) {
            notificationService.createNotification(
              'UNKNOWN_PERSON', 
              'Unknown Person Detected (Video)', 
              `An unknown person was detected in uploaded video: ${req.file.originalname}`, 
              'HIGH'
            );
            if (emailService && s3CropUrl) {
              emailService.sendUnknownPersonAlert(s3CropUrl);
            }
          }
        }
      }
    }

    // Insert legacy video_history record for backward compatibility
    await db.run(
      `INSERT INTO video_history (id, video_filename, frames_analyzed, humans_detected, faces_registered, faces_recognized) VALUES (?, ?, ?, ?, ?, ?)`,
      [sessionId, req.file.originalname, totalFrames, personCount, facesRegistered.length, facesRecognized.length]
    );

    notificationService.createNotification(
      'UPLOAD_COMPLETE',
      'Video Analysis Complete',
      `Processed video ${req.file.originalname}. Found ${personCount} unique people.`,
      'INFO'
    );

    return res.status(200).json({
      success: true,
      sessionId,
      summary: {
        totalFramesAnalyzed: totalFrames,
        humansDetectedCount: personCount,
        uniquePeople: personCount,
        averageConfidence: averageConfidence,
        people: yoloResult.people || [],
        facesRegistered,
        facesRecognized,
        faceSnapshots
      },
      message: `YOLO analyzed ${totalFrames} frames. Detected ${personCount} unique people and recognized ${facesRecognized.length} recurring identities.`
    });

  } catch (error) {
    deleteTempFile(filePath);
    console.error("[Video Error]", error.message);
    return res.status(500).json({ success: false, message: `Server error: ${error.message}` });
  }
});

// Mount Analytics routes
app.use("/api/analytics", require("./routes/analytics"));

app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════╗`);
  console.log(`  ║   VisionVault-AI Backend Running     ║`);
  console.log(`  ║   http://localhost:${PORT}              ║`);
  console.log(`  ╚══════════════════════════════════════╝\n`);
});

// ── Serve React/Vite frontend static build ────────────────────
const FRONTEND_DIST = path.join(__dirname, "..", "frontend", "dist");
if (fs.existsSync(FRONTEND_DIST)) {
  app.use(express.static(FRONTEND_DIST));
  // SPA fallback — serve index.html for any non-API route
  app.get(/^(?!\/api).*$/, (req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, "index.html"));
  });
  console.log("[Frontend] Serving static files from:", FRONTEND_DIST);
} else {
  console.warn("[Frontend] No dist build found at:", FRONTEND_DIST);
}
