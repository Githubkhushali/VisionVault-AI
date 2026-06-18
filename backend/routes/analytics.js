/**
 * analytics.js — Full Analytics Routes (PostgreSQL-native)
 *
 * All analytics are computed directly from PostgreSQL tables.
 * No longer proxies to the Python AI service — this ensures data
 * is always available even if the AI service is not running.
 *
 * Data sources:
 *   identities          – every unique person ever detected
 *   persons             – name registry (identityId → name)
 *   live_stream_faces   – per-person per-session appearance counts + timestamps
 *   live_stream_sessions– session start/end timestamps
 *   session_people      – image/video upload detections
 *   sessions            – image/video upload sessions
 *   daily_logs          – per-person per-day aggregates (written on detection)
 */

const express = require("express");
const router  = express.Router();
const db      = require("../db-postgres");
const s3Service = require("../services/S3Service");

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────
const toInt = (v) => parseInt(v || 0, 10);
const toFloat = (v) => parseFloat(v || 0);

/** Format a Postgres TIMESTAMP/DATE string → 'YYYY-MM-DD' */
const toDateStr = (ts) => {
  if (!ts) return null;
  const d = new Date(ts);
  return d.toISOString().slice(0, 10);
};

/** Format a Postgres TIMESTAMP → 'HH:MM' */
const toTimeStr = (ts) => {
  if (!ts) return null;
  const d = new Date(ts);
  return d.toTimeString().slice(0, 5);
};

// ─────────────────────────────────────────────────────────────────────────────
//  Existing routes (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

// Route: Summary counts
router.get("/summary", async (req, res) => {
  try {
    const sessionsRes    = await db.get(`SELECT COUNT(*) as count FROM sessions`);
    const identitiesRes  = await db.get(`SELECT COUNT(*) as count FROM identities`);
    const facesRes       = await db.get(`SELECT COALESCE(SUM(face_count), 0) as count FROM sessions`);
    const videosRes      = await db.get(`SELECT COUNT(*) as count FROM sessions WHERE type = 'video'`);
    const imagesRes      = await db.get(`SELECT COUNT(*) as count FROM sessions WHERE type = 'image'`);
    res.json({
      totalSessions:       toInt(sessionsRes?.count),
      totalUniquePeople:   toInt(identitiesRes?.count),
      totalFacesDetected:  toInt(facesRes?.count),
      totalVideosAnalyzed: toInt(videosRes?.count),
      totalImagesAnalyzed: toInt(imagesRes?.count),
    });
  } catch (err) {
    console.error("[Analytics] summary error:", err.message);
    res.status(500).json({ error: "Failed to fetch analytics summary." });
  }
});

// Route: Traffic over time
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
    res.json(rows.map(r => ({
      date:        r.date,
      peopleCount: toInt(r.peopleCount),
      videoCount:  toInt(r.videoCount),
      imageCount:  toInt(r.imageCount),
    })));
  } catch (err) {
    console.error("[Analytics] traffic error:", err.message);
    res.status(500).json({ error: "Failed to fetch traffic data." });
  }
});

// Route: Top recurring identities
router.get("/identities", async (req, res) => {
  try {
    const rows = await db.all(`
      SELECT
        i.id,
        i.canonical_face_url as "canonicalFaceUrl",
        i.total_appearances  as "totalAppearances",
        TO_CHAR(i.last_seen, 'Mon DD, YYYY HH24:MI') as "lastSeen",
        p.name
      FROM identities i
      LEFT JOIN persons p ON p.identity_id = i.id
      ORDER BY i.total_appearances DESC, i.last_seen DESC
      LIMIT 50;
    `);
    
    const preSignedRows = [];
    for (const r of rows) {
      const canonicalFaceUrl = await s3Service.getPresignedUrl(r.canonicalFaceUrl || buildFaceUrl({ identity_id: r.id }));
      preSignedRows.push({
        ...r,
        canonicalFaceUrl,
        totalAppearances: toInt(r.totalAppearances),
        name: r.name || null,
      });
    }
    res.json(preSignedRows);
  } catch (err) {
    console.error("[Analytics] identities error:", err.message);
    res.status(500).json({ error: "Failed to fetch identities data." });
  }
});

// Route: Average confidence history
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
    res.json(rows.map(r => ({ date: r.date, averageConfidence: toFloat(r.averageConfidence) })));
  } catch (err) {
    console.error("[Analytics] confidence error:", err.message);
    res.status(500).json({ error: "Failed to fetch confidence data." });
  }
});

// Route: Paginated upload sessions
router.get("/sessions", async (req, res) => {
  try {
    const sessions = await db.all(`
      SELECT * FROM (
        SELECT
          id, filename, type, s3_url as "s3Url",
          processed_at as sort_time,
          TO_CHAR(processed_at, 'Mon DD, YYYY HH24:MI') as "processedAt",
          total_frames as "totalFrames", people_count as "peopleCount",
          face_count as "faceCount", unique_identities_count as "uniqueIdentitiesCount",
          ROUND(average_confidence * 100, 1) as "averageConfidence"
        FROM sessions
        UNION ALL
        SELECT
          id, 'Live Stream' as filename, 'live' as type, s3_url as "s3Url",
          started_at as sort_time,
          TO_CHAR(started_at, 'Mon DD, YYYY HH24:MI') as "processedAt",
          0 as "totalFrames", unique_faces_count as "peopleCount",
          unique_faces_count as "faceCount", unique_faces_count as "uniqueIdentitiesCount",
          0 as "averageConfidence"
        FROM live_stream_sessions
      ) AS combined
      ORDER BY sort_time DESC;
    `);

    for (const s of sessions) {
      s.peopleCount          = toInt(s.peopleCount);
      s.faceCount            = toInt(s.faceCount);
      s.totalFrames          = toInt(s.totalFrames);
      s.uniqueIdentitiesCount = toInt(s.uniqueIdentitiesCount);
      s.averageConfidence    = toFloat(s.averageConfidence);

      if (s.s3Url) {
        s.s3Url = await s3Service.getPresignedUrl(s.s3Url);
      }

      if (s.type === "live") {
        const faces = await db.all(`
          SELECT lsf.identity_id as "identityId",
                 lsf.s3_url as "s3Url",
                 i.canonical_face_url as "canonicalFaceUrl",
                 lsf.appearance_count as "framesAppeared",
                 p.name
          FROM live_stream_faces lsf
          LEFT JOIN identities i ON i.id = lsf.identity_id
          LEFT JOIN persons p ON p.identity_id = lsf.identity_id
          WHERE lsf.session_id = ?
        `, [s.id]);
        
        s.people = [];
        for (const f of faces) {
          const rawCropUrl = buildFaceUrl({
            identity_id: f.identityId,
            canonical_face_url: f.canonicalFaceUrl,
            s3_url: f.s3Url
          });
          const s3CropUrl = await s3Service.getPresignedUrl(rawCropUrl);
          s.people.push({
            identityId:   f.identityId,
            s3CropUrl,
            framesAppeared: toInt(f.framesAppeared),
            name:         f.name || null,
          });
        }
      } else {
        const people = await db.all(`
          SELECT sp.track_id as "trackId",
                 ROUND(sp.average_confidence * 100, 1) as "averageConfidence",
                 sp.face_count as "faceCount",
                 sp.best_face_confidence as "bestFaceConfidence",
                 sp.identity_id as "identityId",
                 sp.s3_crop_url as "s3CropUrl",
                 i.canonical_face_url as "canonicalFaceUrl",
                 sp.frames_appeared as "framesAppeared",
                 sp.reentries
          FROM session_people sp
          LEFT JOIN identities i ON i.id = sp.identity_id
          WHERE sp.session_id = ?
          ORDER BY sp.track_id;
        `, [s.id]);
        
        s.people = [];
        for (const p of people) {
          const rawCropUrl = buildFaceUrl({
            identity_id: p.identityId,
            canonical_face_url: p.canonicalFaceUrl,
            s3_url: p.s3CropUrl
          });
          const s3CropUrl = await s3Service.getPresignedUrl(rawCropUrl);
          s.people.push({
            trackId:          p.trackId,
            averageConfidence: toFloat(p.averageConfidence),
            faceCount:         toInt(p.faceCount),
            bestFaceConfidence: toFloat(p.bestFaceConfidence),
            identityId:        p.identityId,
            s3CropUrl,
            framesAppeared:    toInt(p.framesAppeared),
            reentries:         toInt(p.reentries),
          });
        }
      }
    }
    res.json({ sessions });
  } catch (err) {
    console.error("[Analytics] sessions error:", err.message);
    res.status(500).json({ error: "Failed to fetch upload sessions." });
  }
});

// Route: Update name in persons table
router.patch("/update-name", async (req, res) => {
  const { identityId, newName } = req.body;
  if (!identityId || !newName) return res.status(400).json({ success: false });
  try {
    await db.run(`
      INSERT INTO persons (identity_id, name) VALUES (?, ?)
      ON CONFLICT (identity_id) DO UPDATE SET name = excluded.name
    `, [identityId, newName]);
    await db.run(`
      UPDATE daily_logs SET name = ? WHERE person_id = ?
    `, [newName, identityId]);
    res.json({ success: true });
  } catch (err) {
    console.error("[Analytics] update-name error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Route: Clear History
router.delete("/sessions", async (req, res) => {
  try {
    await db.run(`DELETE FROM session_people`);
    await db.run(`DELETE FROM sessions`);
    await db.run(`DELETE FROM identities`);
    await db.run(`DELETE FROM detected_faces`);
    await db.run(`DELETE FROM video_history`);
    await db.run(`DELETE FROM live_stream_faces`);
    await db.run(`DELETE FROM live_stream_sessions`);
    await db.run(`DELETE FROM daily_logs`);
    res.json({ success: true, message: "History cleared successfully." });
  } catch (err) {
    console.error("[Analytics] clear history error:", err.message);
    res.status(500).json({ error: "Failed to clear sessions." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  NEW: Log Analysis Analytics (computed directly from PostgreSQL)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a face URL from the S3 bucket for a given identity.
 * Tries: persons table canonical URL → identities canonical_face_url → people/ S3 key
 */
function buildFaceUrl(row) {
  if (row.canonical_face_url && row.canonical_face_url.startsWith("http")) {
    return row.canonical_face_url;
  }
  if (row.s3_url && row.s3_url.startsWith("http")) {
    return row.s3_url;
  }
  // Construct from env vars
  const bucket = process.env.S3_BUCKET_NAME;
  const region = process.env.AWS_REGION;
  if (bucket && region && row.identity_id) {
    return `https://${bucket}.s3.${region}.amazonaws.com/people/${row.identity_id}/face_1.jpg`;
  }
  return null;
}

// ── Route: Daily Summary — 4 KPI cards ────────────────────────
router.get("/daily-summary", async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  try {
    // Pull all live_stream_faces for sessions on this date (primary source)
    const liveRows = await db.all(`
      SELECT
        lsf.identity_id,
        COALESCE(p.name, NULL) as name,
        SUM(lsf.appearance_count) as total_appearances
      FROM live_stream_faces lsf
      JOIN live_stream_sessions lss ON lss.id = lsf.session_id
      LEFT JOIN persons p ON p.identity_id = lsf.identity_id
      WHERE DATE(lss.started_at) = ?
      GROUP BY lsf.identity_id, p.name
    `, [date]);

    // Also pull from session_people for image/video uploads on this date
    const uploadRows = await db.all(`
      SELECT
        sp.identity_id,
        COALESCE(p.name, NULL) as name,
        COUNT(*) as total_appearances
      FROM session_people sp
      JOIN sessions s ON s.id = sp.session_id
      LEFT JOIN persons p ON p.identity_id = sp.identity_id
      WHERE sp.identity_id IS NOT NULL
        AND DATE(s.processed_at) = ?
      GROUP BY sp.identity_id, p.name
    `, [date]);

    // Also try daily_logs table (populated by new detections)
    const dailyRows = await db.all(`
      SELECT person_id as identity_id, name, entry_count as total_appearances
      FROM daily_logs
      WHERE date = ?
    `, [date]);

    // Merge all three sources by identity_id
    const map = new Map();
    const addRows = (rows) => {
      for (const r of rows) {
        if (!r.identity_id) continue;
        const existing = map.get(r.identity_id);
        if (existing) {
          existing.total += toInt(r.total_appearances);
          if (!existing.name && r.name) existing.name = r.name;
        } else {
          map.set(r.identity_id, { id: r.identity_id, name: r.name || null, total: toInt(r.total_appearances) });
        }
      }
    };
    addRows(liveRows);
    addRows(uploadRows);
    addRows(dailyRows);

    const all = [...map.values()];
    const totalUniquePeople = all.length;
    const totalEntries      = all.reduce((s, r) => s + r.total, 0);
    const returningVisitors = all.filter(r => r.total > 1).length;
    const unknownVisitors   = all.filter(r => !r.name).length;

    res.json({ date, totalUniquePeople, totalEntries, returningVisitors, unknownVisitors });
  } catch (err) {
    console.error("[Analytics] daily-summary error:", err.message);
    res.status(503).json({ error: err.message, date, totalUniquePeople: 0, totalEntries: 0, returningVisitors: 0, unknownVisitors: 0 });
  }
});

// ── Route: Daily Logs — person cards + table ───────────────────
router.get("/daily-logs", async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  try {
    // Live stream detections
    const liveRows = await db.all(`
      SELECT
        lsf.identity_id,
        COALESCE(p.name, NULL) as name,
        i.canonical_face_url,
        MIN(lsf.first_seen) as first_seen,
        MAX(lsf.last_seen) as last_seen,
        SUM(lsf.appearance_count) as entry_count
      FROM live_stream_faces lsf
      JOIN live_stream_sessions lss ON lss.id = lsf.session_id
      LEFT JOIN persons p ON p.identity_id = lsf.identity_id
      LEFT JOIN identities i ON i.id = lsf.identity_id
      WHERE DATE(lss.started_at) = ?
      GROUP BY lsf.identity_id, p.name, i.canonical_face_url
    `, [date]);

    // Upload detections (image/video)
    const uploadRows = await db.all(`
      SELECT
        sp.identity_id,
        COALESCE(p.name, NULL) as name,
        i.canonical_face_url,
        MIN(s.processed_at) as first_seen,
        MAX(s.processed_at) as last_seen,
        COUNT(*) as entry_count
      FROM session_people sp
      JOIN sessions s ON s.id = sp.session_id
      LEFT JOIN persons p ON p.identity_id = sp.identity_id
      LEFT JOIN identities i ON i.id = sp.identity_id
      WHERE sp.identity_id IS NOT NULL
        AND DATE(s.processed_at) = ?
      GROUP BY sp.identity_id, p.name, i.canonical_face_url
    `, [date]);

    // daily_logs (new detections written by Python service)
    const dailyRows = await db.all(`
      SELECT dl.person_id as identity_id, dl.name,
             i.canonical_face_url,
             dl.first_seen, dl.last_seen, dl.entry_count
      FROM daily_logs dl
      LEFT JOIN identities i ON i.id = dl.person_id
      WHERE dl.date = ?
    `, [date]);

    // Merge by identity_id, picking best values
    const map = new Map();
    const S3B = process.env.S3_BUCKET_NAME;
    const S3R = process.env.AWS_REGION;

    const merge = (rows) => {
      for (const r of rows) {
        if (!r.identity_id) continue;
        // Build S3 face URL
        const faceUrl = r.canonical_face_url ||
          (S3B && S3R ? `https://${S3B}.s3.${S3R}.amazonaws.com/people/${r.identity_id}/face_1.jpg` : null);

        const existing = map.get(r.identity_id);
        if (existing) {
          existing.entry_count += toInt(r.entry_count);
          if (!existing.name && r.name) existing.name = r.name;
          if (!existing.faceUrl && faceUrl) existing.faceUrl = faceUrl;
          // Pick earliest first_seen, latest last_seen
          if (r.first_seen && (!existing.first_seen || r.first_seen < existing.first_seen)) {
            existing.first_seen = r.first_seen;
          }
          if (r.last_seen && (!existing.last_seen || r.last_seen > existing.last_seen)) {
            existing.last_seen = r.last_seen;
          }
        } else {
          map.set(r.identity_id, {
            person_id:   r.identity_id,
            name:        r.name || null,
            faceUrl,
            first_seen:  r.first_seen || null,
            last_seen:   r.last_seen  || null,
            entry_count: toInt(r.entry_count),
          });
        }
      }
    };
    merge(liveRows);
    merge(uploadRows);
    merge(dailyRows);

    const people = [];
    for (const p of map.values()) {
      const faceUrl = await s3Service.getPresignedUrl(p.faceUrl);
      people.push({
        ...p,
        faceUrl,
        first_seen: toTimeStr(p.first_seen),
        last_seen:  toTimeStr(p.last_seen),
      });
    }
    people.sort((a, b) => b.entry_count - a.entry_count);

    res.json({ date, people });
  } catch (err) {
    console.error("[Analytics] daily-logs error:", err.message);
    res.status(503).json({ error: err.message, date, people: [] });
  }
});

// ── Route: Hourly Stats ────────────────────────────────────────
router.get("/hourly-stats", async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  try {
    // Live stream — count per hour based on session start
    const liveHours = await db.all(`
      SELECT
        EXTRACT(HOUR FROM lss.started_at)::int AS hour,
        COALESCE(SUM(lsf.appearance_count), 0) AS detections
      FROM live_stream_faces lsf
      JOIN live_stream_sessions lss ON lss.id = lsf.session_id
      WHERE DATE(lss.started_at) = ?
      GROUP BY EXTRACT(HOUR FROM lss.started_at)
    `, [date]);

    // Upload sessions — count faces per hour
    const uploadHours = await db.all(`
      SELECT
        EXTRACT(HOUR FROM s.processed_at)::int AS hour,
        COUNT(sp.id) AS detections
      FROM session_people sp
      JOIN sessions s ON s.id = sp.session_id
      WHERE sp.identity_id IS NOT NULL AND DATE(s.processed_at) = ?
      GROUP BY EXTRACT(HOUR FROM s.processed_at)
    `, [date]);

    // daily_logs hourly (if available) — first_seen as 'HH:MM'
    const dailyHours = await db.all(`
      SELECT
        CAST(SPLIT_PART(first_seen::text, ':', 1) AS INTEGER) AS hour,
        SUM(entry_count) AS detections
      FROM daily_logs
      WHERE date = ?
      GROUP BY SPLIT_PART(first_seen::text, ':', 1)
    `, [date]);

    // Build 24-slot array
    const hourMap = new Array(24).fill(0);
    for (const r of liveHours)   hourMap[toInt(r.hour)] += toInt(r.detections);
    for (const r of uploadHours) hourMap[toInt(r.hour)] += toInt(r.detections);
    for (const r of dailyHours)  hourMap[toInt(r.hour)] += toInt(r.detections);

    const hours = hourMap.map((detections, h) => ({
      hour: String(h).padStart(2, "0"),
      detections,
    }));

    res.json({ date, hours });
  } catch (err) {
    console.error("[Analytics] hourly-stats error:", err.message);
    const empty = Array.from({ length: 24 }, (_, h) => ({ hour: String(h).padStart(2, "0"), detections: 0 }));
    res.status(503).json({ date, hours: empty });
  }
});

// ── Route: 7-Day Visitor Trend ─────────────────────────────────
router.get("/daily-trend", async (req, res) => {
  const days = toInt(req.query.days) || 7;
  try {
    // Live stream sessions trend
    const liveTrend = await db.all(`
      SELECT
        DATE(lss.started_at) as date,
        COUNT(DISTINCT lsf.identity_id) as unique_people,
        COALESCE(SUM(lsf.appearance_count), 0) as total_entries
      FROM live_stream_sessions lss
      LEFT JOIN live_stream_faces lsf ON lsf.session_id = lss.id
      WHERE lss.started_at >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(lss.started_at)
      ORDER BY date ASC
    `);

    // Upload sessions trend
    const uploadTrend = await db.all(`
      SELECT
        DATE(s.processed_at) as date,
        COUNT(DISTINCT sp.identity_id) as unique_people,
        COUNT(sp.id) as total_entries
      FROM sessions s
      LEFT JOIN session_people sp ON sp.session_id = s.id
      WHERE s.processed_at >= NOW() - INTERVAL '${days} days'
        AND sp.identity_id IS NOT NULL
      GROUP BY DATE(s.processed_at)
      ORDER BY date ASC
    `);

    // daily_logs trend
    const dailyTrend = await db.all(`
      SELECT
        date,
        COUNT(DISTINCT person_id) as unique_people,
        SUM(entry_count) as total_entries
      FROM daily_logs
      WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY date
      ORDER BY date ASC
    `);

    // Merge all three by date
    const map = new Map();
    const addTrend = (rows) => {
      for (const r of rows) {
        const d = toDateStr(r.date) || String(r.date);
        if (!d) continue;
        const existing = map.get(d);
        if (existing) {
          existing.unique_people  = Math.max(existing.unique_people, toInt(r.unique_people));
          existing.total_entries += toInt(r.total_entries);
        } else {
          map.set(d, { date: d, unique_people: toInt(r.unique_people), total_entries: toInt(r.total_entries) });
        }
      }
    };
    addTrend(liveTrend);
    addTrend(uploadTrend);
    addTrend(dailyTrend);

    const trend = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
    res.json({ trend });
  } catch (err) {
    console.error("[Analytics] daily-trend error:", err.message);
    res.status(503).json({ trend: [] });
  }
});

// ── Route: Top People (last N days) ───────────────────────────
router.get("/top-people", async (req, res) => {
  const days = toInt(req.query.days) || 7;
  try {
    // From live sessions
    const liveTop = await db.all(`
      SELECT
        lsf.identity_id as person_id,
        COALESCE(p.name, NULL) as name,
        i.canonical_face_url,
        SUM(lsf.appearance_count) as total,
        MAX(lss.started_at) as last_seen
      FROM live_stream_faces lsf
      JOIN live_stream_sessions lss ON lss.id = lsf.session_id
      LEFT JOIN persons p ON p.identity_id = lsf.identity_id
      LEFT JOIN identities i ON i.id = lsf.identity_id
      WHERE lss.started_at >= NOW() - INTERVAL '${days} days'
      GROUP BY lsf.identity_id, p.name, i.canonical_face_url
    `);

    // From upload sessions
    const uploadTop = await db.all(`
      SELECT
        sp.identity_id as person_id,
        COALESCE(p.name, NULL) as name,
        i.canonical_face_url,
        COUNT(*) as total,
        MAX(s.processed_at) as last_seen
      FROM session_people sp
      JOIN sessions s ON s.id = sp.session_id
      LEFT JOIN persons p ON p.identity_id = sp.identity_id
      LEFT JOIN identities i ON i.id = sp.identity_id
      WHERE sp.identity_id IS NOT NULL
        AND s.processed_at >= NOW() - INTERVAL '${days} days'
      GROUP BY sp.identity_id, p.name, i.canonical_face_url
    `);

    // From daily_logs
    const dailyTop = await db.all(`
      SELECT
        dl.person_id,
        dl.name,
        i.canonical_face_url,
        SUM(dl.entry_count) as total,
        MAX(dl.date) as last_seen
      FROM daily_logs dl
      LEFT JOIN identities i ON i.id = dl.person_id
      WHERE dl.date >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY dl.person_id, dl.name, i.canonical_face_url
    `);

    const S3B = process.env.S3_BUCKET_NAME;
    const S3R = process.env.AWS_REGION;

    const map = new Map();
    const addTop = (rows) => {
      for (const r of rows) {
        if (!r.person_id) continue;
        const faceUrl = r.canonical_face_url ||
          (S3B && S3R ? `https://${S3B}.s3.${S3R}.amazonaws.com/people/${r.person_id}/face_1.jpg` : null);
        const existing = map.get(r.person_id);
        if (existing) {
          existing.total += toInt(r.total);
          if (!existing.name && r.name) existing.name = r.name;
          if (!existing.faceUrl && faceUrl) existing.faceUrl = faceUrl;
          if (r.last_seen > existing.last_seen) existing.last_seen = r.last_seen;
        } else {
          map.set(r.person_id, {
            person_id: r.person_id,
            name:      r.name || null,
            faceUrl,
            total:     toInt(r.total),
            last_seen: r.last_seen,
          });
        }
      }
    };
    addTop(liveTop);
    addTop(uploadTop);
    addTop(dailyTop);

    const sortedPeople = [...map.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    const topPeople = [];
    for (const p of sortedPeople) {
      const faceUrl = await s3Service.getPresignedUrl(p.faceUrl);
      topPeople.push({
        ...p,
        faceUrl,
        last_seen: p.last_seen ? toTimeStr(new Date(p.last_seen)) : null,
      });
    }

    res.json({ topPeople });
  } catch (err) {
    console.error("[Analytics] top-people error:", err.message);
    res.status(503).json({ topPeople: [] });
  }
});

// ── Route: Available Dates ─────────────────────────────────────
router.get("/available-dates", async (req, res) => {
  try {
    const liveDates = await db.all(`
      SELECT DISTINCT DATE(started_at)::text as date
      FROM live_stream_sessions
      WHERE started_at IS NOT NULL
      ORDER BY date DESC LIMIT 30
    `);
    const uploadDates = await db.all(`
      SELECT DISTINCT DATE(processed_at)::text as date
      FROM sessions
      WHERE processed_at IS NOT NULL
      ORDER BY date DESC LIMIT 30
    `);
    const dailyDates = await db.all(`
      SELECT DISTINCT date::text FROM daily_logs ORDER BY date DESC LIMIT 30
    `);

    const allDates = new Set([
      ...liveDates.map(r => r.date),
      ...uploadDates.map(r => r.date),
      ...dailyDates.map(r => r.date),
    ].filter(Boolean));

    const dates = [...allDates].sort((a, b) => b.localeCompare(a)).slice(0, 30);
    res.json({ dates });
  } catch (err) {
    console.error("[Analytics] available-dates error:", err.message);
    res.status(503).json({ dates: [] });
  }
});

// ── Route: Rebuild Analytics (backfill daily_logs from PostgreSQL) ─
router.post("/rebuild", async (req, res) => {
  try {
    console.log("[Analytics] Rebuilding daily_logs from PostgreSQL...");

    // Backfill from live_stream_faces
    const liveData = await db.all(`
      SELECT
        DATE(lss.started_at) as date,
        lsf.identity_id as person_id,
        COALESCE(p.name, NULL) as name,
        TO_CHAR(MIN(lsf.first_seen), 'HH24:MI') as first_seen,
        TO_CHAR(MAX(lsf.last_seen), 'HH24:MI') as last_seen,
        SUM(lsf.appearance_count) as entry_count,
        MAX(i.canonical_face_url) as face_url
      FROM live_stream_faces lsf
      JOIN live_stream_sessions lss ON lss.id = lsf.session_id
      LEFT JOIN persons p ON p.identity_id = lsf.identity_id
      LEFT JOIN identities i ON i.id = lsf.identity_id
      WHERE lsf.identity_id IS NOT NULL AND lss.started_at IS NOT NULL
      GROUP BY DATE(lss.started_at), lsf.identity_id, p.name
    `);

    // Backfill from upload session_people
    const uploadData = await db.all(`
      SELECT
        DATE(s.processed_at) as date,
        sp.identity_id as person_id,
        COALESCE(p.name, NULL) as name,
        TO_CHAR(MIN(s.processed_at), 'HH24:MI') as first_seen,
        TO_CHAR(MAX(s.processed_at), 'HH24:MI') as last_seen,
        COUNT(*) as entry_count,
        MAX(i.canonical_face_url) as face_url
      FROM session_people sp
      JOIN sessions s ON s.id = sp.session_id
      LEFT JOIN persons p ON p.identity_id = sp.identity_id
      LEFT JOIN identities i ON i.id = sp.identity_id
      WHERE sp.identity_id IS NOT NULL AND s.processed_at IS NOT NULL
      GROUP BY DATE(s.processed_at), sp.identity_id, p.name
    `);

    let upserted = 0;
    const upsertRow = async (row) => {
      if (!row.date || !row.person_id) return;
      try {
        await db.run(`
          INSERT INTO daily_logs (date, person_id, name, first_seen, last_seen, entry_count, face_url)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (date, person_id) DO UPDATE SET
            entry_count = daily_logs.entry_count + excluded.entry_count,
            last_seen   = GREATEST(daily_logs.last_seen, excluded.last_seen::time),
            name        = COALESCE(excluded.name, daily_logs.name),
            face_url    = COALESCE(excluded.face_url, daily_logs.face_url)
        `, [
          toDateStr(row.date),
          row.person_id,
          row.name || null,
          row.first_seen || null,
          row.last_seen  || null,
          toInt(row.entry_count),
          row.face_url || null,
        ]);
        upserted++;
      } catch (e) {
        console.error(`[Analytics] upsertRow error for ${row.person_id}:`, e.message);
        // Skip individual row errors
      }
    };

    for (const r of liveData)   await upsertRow(r);
    for (const r of uploadData) await upsertRow(r);

    console.log(`[Analytics] Rebuild complete — ${upserted} rows upserted.`);
    res.json({ success: true, rowsUpserted: upserted });
  } catch (err) {
    console.error("[Analytics] rebuild error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
