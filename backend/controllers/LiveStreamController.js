const liveStreamService = require('../services/LiveStreamService');
const sessionService = require('../services/SessionService');
const fs = require('fs');
const db = require('../db-postgres');

class LiveStreamController {
  startSession(req, res) {
    try {
      const sessionId = liveStreamService.startSession();
      console.log(`[Session] Started: ${sessionId}`);
      res.json({ success: true, sessionId });
    } catch (error) {
      res.status(409).json({ error: error.message });
    }
  }

  async endSession(req, res) {
    try {
      // Endpoint `/api/session/end`
      const savedSession = await sessionService.endLiveSession();
      res.status(200).json({
        success: true,
        report: savedSession // returning this exact newly created session object
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  async processFrame(req, res) {
    if (!req.file) {
      return res.status(400).json({ error: "No frame image provided." });
    }

    const filePath = req.file.path;
    try {
      const formData = new FormData();
      // Use fs instead of fs.promises since form-data doesn't inherently take Blobs in older node without proper wrappers.
      // Wait, in server.js we used: const fileBlob = await fs.openAsBlob(filePath);
      const fileBlob = await fs.openAsBlob(filePath);
      formData.append("frame", fileBlob, req.file.filename);

      const response = await fetch("http://127.0.0.1:5002/detect-frame", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`AI service returned ${response.status}`);
      }

      const pythonResult = await response.json();
      const detections = pythonResult.detections || [];
      const trackerResult = { totalEntries: 0, totalExits: 0, identities: {} };

      // Look up and override names from PostgreSQL persons table for previously labeled faces
      for (const det of detections) {
        if (det.identityId) {
          try {
            const nameRow = await db.get(`SELECT name FROM persons WHERE identity_id = ?`, [det.identityId]);
            if (nameRow && nameRow.name) {
              det.name = nameRow.name;
            }
          } catch (dbErr) {
            console.error("[LiveStreamController] DB name lookup error:", dbErr.message);
          }
        }
      }

      // Process detections through our LiveStreamService and Tracker
      if (liveStreamService.active) {
        for (const det of detections) {
          if (det.identityId) {
            const trackEvt = liveStreamService.tracker.evaluate(det.identityId, det.bbox);
            trackerResult.identities[det.identityId] = trackEvt;
            
            // Fault-Tolerant live tracking data (name & appearances)
            liveStreamService.recordFaceAppearance(det.identityId, det.s3Url || null, trackEvt);
            
            // Optional: You can persist to DB immediately here if needed, but the prompt says 
            // "save a new record to the DB ... Once the S3 link is generated", so we just accumulate.
          }
        }
      }

      res.status(200).json({
        success: true,
        detections,
        trackerResult,
      });
    } catch (error) {
      console.error("[LiveStreamController] Frame error:", error.message);
      res.status(500).json({ error: "Frame processing failed." });
    } finally {
      const { unlink } = require('fs/promises');
      await unlink(filePath).catch(() => {});
    }
  }
}

module.exports = new LiveStreamController();
