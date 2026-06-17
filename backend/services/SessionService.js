const s3Service = require('./S3Service');
const sessionRepository = require('../repositories/SessionRepository');
const identityRepository = require('../repositories/IdentityRepository');
const liveStreamService = require('./LiveStreamService');

class SessionService {
  /**
   * Terminates the active live session, uploads logs to S3, and persists to DB.
   */
  async endLiveSession() {
    if (!liveStreamService.active) {
      throw new Error("No active stream session to stop.");
    }

    const sessionData = liveStreamService.getCompiledSessionData();
    
    // Populate database-saved names in compiled faces list before uploading log to S3
    const db = require('../db-postgres');
    for (const face of sessionData.faces) {
      try {
        const nameRow = await db.get(`SELECT name FROM persons WHERE identity_id = ?`, [face.identityId]);
        face.name = nameRow ? nameRow.name : 'Unknown';
      } catch (err) {
        face.name = 'Unknown';
      }
    }
    
    // 1. Upload to AWS S3 (Session Termination & AWS S3 Upload Pipeline)
    let s3Url = null;
    try {
      s3Url = await s3Service.uploadSessionLog(sessionData, sessionData.sessionId);
    } catch (err) {
      console.error("[SessionService] Failed to upload session log to S3:", err);
      // Optional: rollback or flag error depending on strictness. 
      // The requirement says "await a successful upload... explicitly handle failures"
      throw new Error("AWS S3 upload failed. Session not saved.");
    }

    // Assign generated S3 URL to session data
    sessionData.s3Url = s3Url;

    // 2. Database Persistence
    try {
      await sessionRepository.saveSession(sessionData);
      await identityRepository.saveLiveStreamFaces(sessionData.sessionId, sessionData.faces);
    } catch (err) {
      console.error("[SessionService] DB Persistence failed:", err);
      throw new Error("Database persistence failed.");
    }

    // 3. Reset in-memory session buffer
    liveStreamService.resetSession();

    // Return exact newly created session object
    return sessionData;
  }

  async getAllHistory() {
    return await sessionRepository.getAllSessions();
  }

  async updateFaceName(identityId, newName) {
    return await identityRepository.updateName(identityId, newName);
  }
}

module.exports = new SessionService();
