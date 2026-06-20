const s3Service = require('./S3Service');
const sessionRepository = require('../repositories/SessionRepository');
const identityRepository = require('../repositories/IdentityRepository');
const liveStreamService = require('./LiveStreamService');

class SessionService {
  /**
   * Terminates the active live session, uploads logs to S3, and persists to DB.
   * @param {string} userId - The user who owns this session
   */
  async endLiveSession(userId = null) {
    if (!liveStreamService.active) {
      throw new Error('No active stream session to stop.');
    }

    const sessionData = liveStreamService.getCompiledSessionData();
    // Use userId from caller, fallback to what was stored in liveStreamService
    const effectiveUserId = userId || sessionData.userId || null;

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

    // 1. Upload to AWS S3 (user-scoped folder)
    let s3Url = null;
    try {
      s3Url = await s3Service.uploadSessionLog(sessionData, sessionData.sessionId, effectiveUserId);
    } catch (err) {
      console.error('[SessionService] Failed to upload session log to S3:', err);
      throw new Error('AWS S3 upload failed. Session not saved.');
    }

    sessionData.s3Url = s3Url;

    // 2. Database Persistence (with user_id)
    try {
      await sessionRepository.saveSession(sessionData, effectiveUserId);
      await identityRepository.saveLiveStreamFaces(sessionData.sessionId, sessionData.faces, effectiveUserId);
    } catch (err) {
      console.error('[SessionService] DB Persistence failed:', err);
      throw new Error('Database persistence failed.');
    }

    // 3. Reset in-memory session buffer
    liveStreamService.resetSession();

    return sessionData;
  }

  /**
   * @param {string} userId - User ID to scope results (null = all, for admin)
   * @param {boolean} isAdmin - If true, return all users' sessions
   */
  async getAllHistory(userId = null, isAdmin = false) {
    return await sessionRepository.getAllSessions(userId, isAdmin);
  }

  async updateFaceName(identityId, newName) {
    return await identityRepository.updateName(identityId, newName);
  }
}

module.exports = new SessionService();
