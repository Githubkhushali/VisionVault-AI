const db = require('../db-postgres');

class IdentityRepository {
  /**
   * Updates a mislabeled name in the database.
   */
  async updateName(identityId, newName) {
    try {
      // Create table 'persons' in PostgreSQL if it doesn't exist to store identity names.
      await db.run(`
        CREATE TABLE IF NOT EXISTS persons (
          identity_id VARCHAR(100) PRIMARY KEY,
          name VARCHAR(255) NOT NULL
        )
      `);

      await db.run(`
        INSERT INTO persons (identity_id, name)
        VALUES ($1, $2)
        ON CONFLICT (identity_id) DO UPDATE SET name = EXCLUDED.name
      `, [identityId, newName]);

      // Sync name update with the Python AI service
      try {
        await fetch("http://127.0.0.1:5002/register-name", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ identityId, name: newName }),
        });
      } catch (err) {
        console.error("[IdentityRepository] Failed to sync name with Python service:", err.message);
      }
      
      return true;
    } catch (error) {
      console.error("[IdentityRepository] Failed to update name:", error);
      throw error;
    }
  }

  /**
   * Save faces for a live stream session
   */
  async saveLiveStreamFaces(sessionId, faceList, userId = null) {
    for (const face of faceList) {
      await db.run(
        `INSERT INTO live_stream_faces
           (session_id, identity_id, appearance_count, s3_url, first_seen, last_seen, user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          sessionId,
          face.identityId,
          face.appearanceCount,
          face.s3Url,
          new Date(face.firstSeen).toISOString(),
          new Date(face.lastSeen).toISOString(),
          userId,
        ]
      );

      if (face.identityId) {
        try {
          const existingIdentity = await db.get(`SELECT id FROM identities WHERE id = ? AND (user_id = ? OR user_id IS NULL)`, [face.identityId, userId]);
          if (!existingIdentity) {
            await db.run(
              `INSERT INTO identities (id, canonical_face_url, total_appearances, user_id) VALUES ($1, $2, $3, $4)`,
              [face.identityId, face.s3Url, face.appearanceCount, userId]
            );
          } else {
            await db.run(
              `UPDATE identities 
               SET canonical_face_url = COALESCE(canonical_face_url, $1), 
                   total_appearances = total_appearances + $2, 
                   last_seen = CURRENT_TIMESTAMP 
               WHERE id = $3 AND (user_id = $4 OR user_id IS NULL)`,
              [face.s3Url, face.appearanceCount, face.identityId, userId]
            );
          }
        } catch (dbErr) {
          console.error('[IdentityRepository] Failed to update identities table for', face.identityId, dbErr.message);
        }
      }
    }
  }
}

module.exports = new IdentityRepository();
