const express = require("express");
const router = express.Router();
const db = require("../db-postgres");

// ── Route: Get Summary Counts ─────────────────────────────────
router.get("/summary", async (req, res) => {
  try {
    const sessionsRes = await db.get(`SELECT COUNT(*) as count FROM sessions`);
    const identitiesRes = await db.get(`SELECT COUNT(*) as count FROM identities`);
    const facesRes = await db.get(`SELECT COALESCE(SUM(face_count), 0) as count FROM sessions`);
    const videosRes = await db.get(`SELECT COUNT(*) as count FROM sessions WHERE type = 'video'`);
    const imagesRes = await db.get(`SELECT COUNT(*) as count FROM sessions WHERE type = 'image'`);

    res.json({
      totalSessions: parseInt(sessionsRes?.count || 0, 10),
      totalUniquePeople: parseInt(identitiesRes?.count || 0, 10),
      totalFacesDetected: parseInt(facesRes?.count || 0, 10),
      totalVideosAnalyzed: parseInt(videosRes?.count || 0, 10),
      totalImagesAnalyzed: parseInt(imagesRes?.count || 0, 10),
    });
  } catch (error) {
    console.error("[Analytics] Error fetching summary:", error.message);
    res.status(500).json({ error: "Failed to fetch analytics summary." });
  }
});

// ── Route: Get Traffic over Time (grouped by date) ─────────────
router.get("/traffic", async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT 
        TO_CHAR(processed_at, 'Mon DD') as date,
        SUM(people_count) as "peopleCount",
        SUM(CASE WHEN type = 'video' THEN 1 ELSE 0 END) as "videoCount",
        SUM(CASE WHEN type = 'image' THEN 1 ELSE 0 END) as "imageCount"
      FROM sessions
      GROUP BY TO_CHAR(processed_at, 'Mon DD'), DATE(processed_at)
      ORDER BY DATE(processed_at) ASC
      LIMIT 15;
    `);
    
    // Map to cast strings from SUM/COUNT to integers
    const formatted = rows.map(r => ({
      date: r.date,
      peopleCount: parseInt(r.peopleCount || 0, 10),
      videoCount: parseInt(r.videoCount || 0, 10),
      imageCount: parseInt(r.imageCount || 0, 10),
    }));

    res.json(formatted);
  } catch (error) {
    console.error("[Analytics] Error fetching traffic:", error.message);
    res.status(500).json({ error: "Failed to fetch traffic data." });
  }
});

// ── Route: Get Top Recurring Identities ────────────────────────
router.get("/identities", async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT 
        id,
        canonical_face_url as "canonicalFaceUrl",
        total_appearances as "totalAppearances",
        TO_CHAR(last_seen, 'Mon DD, YYYY HH24:MI') as "lastSeen"
      FROM identities
      ORDER BY total_appearances DESC, last_seen DESC
      LIMIT 50;
    `);

    // Merge names from the AI service's SQLite persons table via /movements
    // The movements endpoint returns { movements: [{ identityId, name, entryCount, exitCount }] }
    let nameMap = {};
    try {
      const movRes = await fetch("http://127.0.0.1:5002/movements");
      if (movRes.ok) {
        const movData = await movRes.json();
        (movData.movements || []).forEach(m => {
          if (m.name && m.name !== "Unknown") {
            nameMap[m.identityId] = { name: m.name, entryCount: m.entryCount, exitCount: m.exitCount };
          }
        });
      }
    } catch (e) {
      // AI service may not be running — gracefully skip name enrichment
    }

    const enriched = rows.map(r => ({
      ...r,
      name: nameMap[r.id]?.name || null,
      entryCount: nameMap[r.id]?.entryCount ?? null,
      exitCount: nameMap[r.id]?.exitCount ?? null,
    }));

    res.json(enriched);
  } catch (error) {
    console.error("[Analytics] Error fetching identities:", error.message);
    res.status(500).json({ error: "Failed to fetch identities data." });
  }
});

// ── Route: Get Average Confidence history ──────────────────────
router.get("/confidence", async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT
        TO_CHAR(processed_at, 'Mon DD') as date,
        ROUND(AVG(average_confidence) * 100, 1) as "averageConfidence"
      FROM sessions
      GROUP BY TO_CHAR(processed_at, 'Mon DD'), DATE(processed_at)
      ORDER BY DATE(processed_at) ASC
      LIMIT 15;
    `);
    
    const formatted = rows.map(r => ({
      date: r.date,
      averageConfidence: parseFloat(r.averageConfidence || 0),
    }));

    res.json(formatted);
  } catch (error) {
    console.error("[Analytics] Error fetching confidence:", error.message);
    res.status(500).json({ error: "Failed to fetch confidence data." });
  }
});

// ── Route: Get Paginated Upload Sessions ────────────────────────
router.get("/sessions", async (req, res) => {
  try {
    const sessions = await db.all(`
      SELECT 
        id,
        filename,
        type,
        s3_url as "s3Url",
        TO_CHAR(processed_at, 'Mon DD, YYYY HH24:MI') as "processedAt",
        total_frames as "totalFrames",
        people_count as "peopleCount",
        face_count as "faceCount",
        unique_identities_count as "uniqueIdentitiesCount",
        ROUND(average_confidence * 100, 1) as "averageConfidence"
      FROM sessions
      ORDER BY processed_at DESC;
    `);

    // Fetch sub-items for each session
    for (const session of sessions) {
      session.peopleCount = parseInt(session.peopleCount || 0, 10);
      session.faceCount = parseInt(session.faceCount || 0, 10);
      session.totalFrames = parseInt(session.totalFrames || 0, 10);
      session.uniqueIdentitiesCount = parseInt(session.uniqueIdentitiesCount || 0, 10);
      session.averageConfidence = parseFloat(session.averageConfidence || 0);

      const people = await db.all(`
        SELECT
          track_id as "trackId",
          ROUND(average_confidence * 100, 1) as "averageConfidence",
          face_count as "faceCount",
          best_face_confidence as "bestFaceConfidence",
          identity_id as "identityId",
          s3_crop_url as "s3CropUrl",
          frames_appeared as "framesAppeared",
          reentries
        FROM session_people
        WHERE session_id = ?
        ORDER BY track_id;
      `, [session.id]);

      session.people = people.map(p => ({
        trackId: p.trackId,
        averageConfidence: parseFloat(p.averageConfidence || 0),
        faceCount: parseInt(p.faceCount || 0, 10),
        bestFaceConfidence: parseFloat(p.bestFaceConfidence || 0),
        identityId: p.identityId,
        s3CropUrl: p.s3CropUrl,
        framesAppeared: parseInt(p.framesAppeared || 0, 10),
        reentries: parseInt(p.reentries || 0, 10),
      }));
    }

    res.json({ sessions });
  } catch (error) {
    console.error("[Analytics] Error fetching sessions:", error.message);
    res.status(500).json({ error: "Failed to fetch upload sessions." });
  }
});

// ── Route: Clear History ──────────────────────────────────────
router.delete("/sessions", async (req, res) => {
  try {
    await db.run(`DELETE FROM session_people`);
    await db.run(`DELETE FROM sessions`);
    await db.run(`DELETE FROM identities`);
    await db.run(`DELETE FROM detected_faces`);
    await db.run(`DELETE FROM video_history`);
    res.json({ success: true, message: "History cleared successfully." });
  } catch (error) {
    console.error("[Analytics] Error clearing sessions:", error.message);
    res.status(500).json({ error: "Failed to clear sessions." });
  }
});

module.exports = router;
