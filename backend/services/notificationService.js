const db = require('../db-postgres');
const crypto = require('crypto');

/**
 * Creates a notification in the database.
 * @param {string} type - UNKNOWN_PERSON, ENTRY_EVENT, EXIT_EVENT, SYSTEM_WARNING, UPLOAD_COMPLETE, LIVE_STREAM_STARTED
 * @param {string} title - The notification title
 * @param {string} message - The notification message
 * @param {string} severity - INFO, WARNING, HIGH
 */
const createNotification = async (type, title, message, severity = 'INFO') => {
  try {
    const id = `notif_${Date.now()}_${crypto.randomUUID().substring(0, 8)}`;
    await db.run(
      `INSERT INTO notifications (id, type, title, message, severity) VALUES (?, ?, ?, ?, ?)`,
      [id, type, title, message, severity]
    );
    console.log(`[NotificationService] Created ${severity} notification: ${title}`);
    return { id, type, title, message, severity };
  } catch (error) {
    console.error(`[NotificationService] Error creating notification: ${error.message}`);
    return null;
  }
};

module.exports = {
  createNotification,
};
