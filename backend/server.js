require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const db = require("./db-postgres");

// ── App Setup ─────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 5005;

app.use(cors());
app.use(express.json());

// ── Live Stream Memory Logs ───────────────────────────────────
let streamSession = {
  active: false,
  startTime: null,
  sessionId: null,
  faceLog: new Map(),
};

function recordFaceAppearance(identityId, s3Url, trackerResult = null) {
  if (!streamSession.active) return;

  const now = Date.now();
  const entries = trackerResult ? (trackerResult.entries || 0) : 0;
  const reentries = trackerResult ? (trackerResult.reentries || 0) : 0;

  if (streamSession.faceLog.has(identityId)) {
    const entry = streamSession.faceLog.get(identityId);
    entry.appearanceCount++;
    entry.lastSeen = now;
    if (s3Url && !entry.s3Url) {
      entry.s3Url = s3Url;
    }

    // Bind specific identity crossings directly from the line tracker
    if (trackerResult) {
      entry.total_entries = entries;
      entry.reentries = reentries;
    }
  } else {
    streamSession.faceLog.set(identityId, {
      identityId,
      s3Url,
      appearanceCount: 1,
      firstSeen: now,
      lastSeen: now,
      total_entries: entries,
      reentries: reentries,
    });
  }
}

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

// ── Route: Process Continuous Live Streams ─────────────────────────
app.post("/api/stream-frame", upload.single("frame"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No frame payload provided." });
  }

  const filePath = req.file.path;

  try {
    // 1. Package and forward binary file payload to python service via fetch FormData
    const formData = new FormData();
    const fileBlob = await fs.openAsBlob(filePath);
    formData.append("frame", fileBlob, req.file.filename);

    const response = await fetch("http://127.0.0.1:5002/detect-frame", {
      method: "POST",
      body: formData,
    });

    // Clean up local temp file storage immediately
    deleteTempFile(filePath);

    if (!response.ok) {
      return res.status(500).json({ error: "Internal AI recognition failure." });
    }

    const result = await response.json();

    // 2. Loop through detected targets to update counters and check line crossings
    for (const det of result.detections || []) {
      if (det.identityId) {
        let trackerResult = null;

        // Evaluate threshold crossings if your line tracker is connected
        if (det.bbox && liveTracker) {
          trackerResult = liveTracker.evaluate(det.identityId, det.bbox);
          det.event = trackerResult.event; // 'ENTRY' | 'EXIT' | 'NONE'
          det.crossings = trackerResult.crossings;
          det.entries = trackerResult.entries;
          det.reentries = trackerResult.reentries;
        }

        // Accumulate session analytics in Node memory map
        recordFaceAppearance(det.identityId, null, trackerResult);

        // Database Sync: Compare face with database to check if they are a globally recurring face
        const existingIdentity = await db.get(
          `SELECT id, total_appearances FROM identities WHERE id = ?`,
          [det.identityId]
        );

        const isRecurringGlobal = !!existingIdentity;
        det.isRecurringGlobal = isRecurringGlobal;

        // Check if recurring within the active stream session
        const sessionLogEntry = streamSession.faceLog.get(det.identityId);
        det.isRecurringSession = sessionLogEntry ? sessionLogEntry.appearanceCount > 1 : false;

        if (isRecurringGlobal) {
          // Increment appearances and update timestamp for globally recurring faces
          await db.run(
            `UPDATE identities SET last_seen = CURRENT_TIMESTAMP, total_appearances = total_appearances + 1 WHERE id = ?`,
            [det.identityId]
          ).catch(() => { });
        } else {
          // Register the identity in the database if seen for the very first time
          await db.run(
            `INSERT INTO identities (id, canonical_face_url, total_appearances) VALUES (?, NULL, 1)`,
            [det.identityId]
          ).catch(() => { });
        }
      }
    }

    return res.status(200).json({
      success: true,
      detections: result.detections
    });

  } catch (err) {
    deleteTempFile(filePath);
    console.error("[stream-frame error]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

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

    console.log(`[YOLO] Sending image to http://127.0.0.1:5002/detect...`);
    const response = await fetch("http://127.0.0.1:5002/detect", {
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


// ── Virtual Threshold Line Tracker (Isolated ID Metrics) ───────
class ThresholdLineTracker {
  constructor(frameHeight = 480, frameWidth = 640) {
    this.threshold = frameHeight / 2;
    this.frameWidth = frameWidth;
    this.identityMap = new Map();
    this.totalEntries = 0;
    this.totalExits = 0;
  }

  evaluate(identityId, bbox) {
    const centerY = bbox.y + bbox.height / 2;
    const isInside = centerY >= this.threshold;

    const prev = this.identityMap.get(identityId);
    let event = 'NONE';

    if (prev === undefined) {
      // First appearance of this ID in the stream
      if (isInside) {
        event = 'ENTRY';
        this.totalEntries++;
        this.identityMap.set(identityId, {
          state: 'INSIDE',
          lastCenterY: centerY,
          crossings: 1,
          entries: 1,
          reentries: 0
        });
      } else {
        this.identityMap.set(identityId, {
          state: 'OUTSIDE',
          lastCenterY: centerY,
          crossings: 0,
          entries: 0,
          reentries: 0
        });
      }
    } else {
      // Recurring ID: check if they cross the threshold line
      const prevState = prev.state || (prev.lastCenterY >= this.threshold ? 'INSIDE' : 'OUTSIDE');

      if (isInside && prevState === 'OUTSIDE') {
        event = 'ENTRY';
        this.totalEntries++;
        const newEntries = (prev.entries || 0) + 1;
        // Reentry is registered only when entering for the 2nd (or more) time
        const newReentries = newEntries > 1 ? (prev.reentries || 0) + 1 : (prev.reentries || 0);

        this.identityMap.set(identityId, {
          state: 'INSIDE',
          lastCenterY: centerY,
          crossings: (prev.crossings || 0) + 1,
          entries: newEntries,
          reentries: newReentries
        });
      } else if (!isInside && prevState === 'INSIDE') {
        event = 'EXIT';
        this.totalExits++;
        this.identityMap.set(identityId, {
          ...prev,
          state: 'OUTSIDE',
          lastCenterY: centerY,
          crossings: (prev.crossings || 0) + 1,
        });
      } else {
        // Just update location, keep current entry/reentry counts
        this.identityMap.set(identityId, {
          ...prev,
          lastCenterY: centerY,
        });
      }
    }

    const currentData = this.identityMap.get(identityId);
    return {
      event,
      crossings: currentData.crossings,
      entries: currentData.entries,
      reentries: currentData.reentries
    };
  }

  getSnapshot() {
    return {
      totalEntries: this.totalEntries,
      totalExits: this.totalExits,
      identities: Object.fromEntries(this.identityMap),
    };
  }

  reset() {
    this.identityMap.clear();
    this.totalEntries = 0;
    this.totalExits = 0;
  }
}


const liveTracker = new ThresholdLineTracker(480, 640);

// ── Route: Start Stream Analysis ──────────────────────────────
app.post("/api/start-stream-analysis", (req, res) => {
  if (streamSession.active) {
    return res.status(409).json({ error: "Stream session already active." });
  }

  streamSession.active = true;
  streamSession.startTime = Date.now();
  streamSession.sessionId = `live_${Date.now()}`;
  streamSession.faceLog.clear();
  liveTracker.reset();

  console.log(`[Session] Started: ${streamSession.sessionId}`);
  res.json({ success: true, sessionId: streamSession.sessionId });
});

// ── Route: Stop Stream Analysis ───────────────────────────────
app.post("/api/stop-stream-analysis", async (req, res) => {
  if (!streamSession.active) {
    return res.status(400).json({ error: "No active stream session to stop." });
  }

  streamSession.active = false;

  const endTime = Date.now();
  const durationMs = endTime - streamSession.startTime;
  const snapshot = liveTracker.getSnapshot();

  const faceList = [...streamSession.faceLog.values()]
    .sort((a, b) => b.appearanceCount - a.appearanceCount);

  const facesWithCrossings = faceList.map(face => ({
    ...face,
    crossings: snapshot.identities[face.identityId]?.crossings ?? 0,
  }));

  try {
    await db.run(
      `INSERT INTO live_stream_sessions
         (id, started_at, ended_at, duration_ms, total_entries, total_exits, unique_faces_count)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        streamSession.sessionId,
        new Date(streamSession.startTime).toISOString(),
        new Date(endTime).toISOString(),
        durationMs,
        snapshot.totalEntries,
        snapshot.totalExits,
        faceList.length,
      ]
    );

    for (const face of faceList) {
      await db.run(
        `INSERT INTO live_stream_faces
           (session_id, identity_id, appearance_count, s3_url, first_seen, last_seen)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          streamSession.sessionId,
          face.identityId,
          face.appearanceCount,
          face.s3Url,
          new Date(face.firstSeen).toISOString(),
          new Date(face.lastSeen).toISOString(),
        ]
      );
    }
  } catch (dbErr) {
    console.error("[Session Save Error]", dbErr.message);
  }

  const finalSessionId = streamSession.sessionId;
  streamSession.sessionId = null;
  streamSession.faceLog.clear();
  liveTracker.reset();

  return res.status(200).json({
    success: true,
    report: {
      sessionId: finalSessionId,
      durationMs,
      durationSec: Math.round(durationMs / 1000),
      totalEntries: snapshot.totalEntries,
      totalExits: snapshot.totalExits,
      uniqueFacesCount: faceList.length,
      faces: facesWithCrossings,
    },
  });
});


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
        }
      }
    }

    // Insert legacy video_history record for backward compatibility
    await db.run(
      `INSERT INTO video_history (id, video_filename, frames_analyzed, humans_detected, faces_registered, faces_recognized) VALUES (?, ?, ?, ?, ?, ?)`,
      [sessionId, req.file.originalname, totalFrames, personCount, facesRegistered.length, facesRecognized.length]
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
