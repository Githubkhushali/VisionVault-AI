const db = require('../db-postgres');

class SessionRepository {
  /**
   * Saves a new session to the database
   */
  async saveSession(sessionData) {
    const { sessionId, startTime, endTime, s3Url, totalEntries, totalExits, uniqueFacesCount } = sessionData;
    
    // Save live stream session
    await db.run(
      `INSERT INTO live_stream_sessions
         (id, started_at, ended_at, duration_ms, total_entries, total_exits, unique_faces_count, s3_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionId,
        new Date(startTime).toISOString(),
        new Date(endTime).toISOString(),
        endTime - startTime,
        totalEntries,
        totalExits,
        uniqueFacesCount,
        s3Url
      ]
    );

    return sessionId;
  }

  /**
   * Gets all sessions (both upload and live streams combined)
   */
  async getAllSessions() {
    const sessions = await db.all(`
      SELECT * FROM (
        SELECT 
          id,
          filename,
          type,
          s3_url as "s3Url",
          processed_at as sort_time,
          TO_CHAR(processed_at, 'Mon DD, YYYY HH24:MI') as "processedAt",
          total_frames as "totalFrames",
          people_count as "peopleCount",
          face_count as "faceCount",
          unique_identities_count as "uniqueIdentitiesCount",
          ROUND(average_confidence * 100, 1) as "averageConfidence"
        FROM sessions

        UNION ALL

        SELECT 
          id,
          'Live Stream' as filename,
          'live' as type,
          s3_url as "s3Url",
          started_at as sort_time,
          TO_CHAR(started_at, 'Mon DD, YYYY HH24:MI') as "processedAt",
          0 as "totalFrames",
          unique_faces_count as "peopleCount",
          unique_faces_count as "faceCount",
          unique_faces_count as "uniqueIdentitiesCount",
          0 as "averageConfidence"
        FROM live_stream_sessions
      ) AS combined
      ORDER BY sort_time DESC;
    `);

    // Fetch sub-items for each session
    for (const session of sessions) {
      session.peopleCount = parseInt(session.peopleCount || 0, 10);
      session.faceCount = parseInt(session.faceCount || 0, 10);
      session.totalFrames = parseInt(session.totalFrames || 0, 10);
      session.uniqueIdentitiesCount = parseInt(session.uniqueIdentitiesCount || 0, 10);
      session.averageConfidence = parseFloat(session.averageConfidence || 0);

      if (session.type === 'live') {
        const liveFaces = await db.all(`
          SELECT
            f.identity_id as "identityId",
            f.s3_url as "s3CropUrl",
            f.appearance_count as "framesAppeared",
            i.canonical_face_url as "canonicalFaceUrl",
            p.name as "name"
          FROM live_stream_faces f
          LEFT JOIN identities i ON i.id = f.identity_id
          LEFT JOIN persons p ON p.identity_id = f.identity_id
          WHERE f.session_id = ?
        `, [session.id]);
        
        session.people = liveFaces.map(p => ({
          trackId: null,
          averageConfidence: 0,
          faceCount: 0,
          bestFaceConfidence: 0,
          identityId: p.identityId,
          name: p.name || 'Unknown',
          s3CropUrl: p.s3CropUrl || p.canonicalFaceUrl,
          framesAppeared: parseInt(p.framesAppeared || 0, 10),
          reentries: 0,
        }));
      } else {
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
    }
    return sessions;
  }
}

module.exports = new SessionRepository();
