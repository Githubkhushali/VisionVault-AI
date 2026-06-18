const express = require('express');
const router = express.Router();
const db = require('../db-postgres');
const { authMiddleware, requireRole } = require('../middleware/auth');

const GLOBAL_SETTINGS_ID = 'global_config';

// Initialize default settings if they don't exist
const initSettings = async () => {
  try {
    const existing = await db.get('SELECT id FROM settings WHERE id = ?', [GLOBAL_SETTINGS_ID]);
    if (!existing) {
      await db.run(
        'INSERT INTO settings (id, email_notifications, sms_notifications, detection_threshold) VALUES (?, ?, ?, ?)',
        [GLOBAL_SETTINGS_ID, false, false, 0.65]
      );
    }
  } catch (error) {
    console.error('[SettingsRoute] Init error:', error);
  }
};
initSettings();

// GET /api/settings
router.get('/', authMiddleware, async (req, res) => {
  try {
    const settings = await db.get('SELECT * FROM settings WHERE id = ?', [GLOBAL_SETTINGS_ID]);
    res.json({ success: true, settings });
  } catch (error) {
    console.error('[SettingsRoute] GET error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// PUT /api/settings
// Requires ADMIN or SECURITY_OFFICER
router.put('/', authMiddleware, requireRole(['ADMIN', 'SECURITY_OFFICER']), async (req, res) => {
  try {
    const { email_notifications, sms_notifications, phone_number, country_code, detection_threshold, aws_region, aws_bucket } = req.body;
    
    await db.run(
      `UPDATE settings SET 
        email_notifications = COALESCE(?, email_notifications),
        sms_notifications = COALESCE(?, sms_notifications),
        phone_number = COALESCE(?, phone_number),
        country_code = COALESCE(?, country_code),
        detection_threshold = COALESCE(?, detection_threshold),
        aws_region = COALESCE(?, aws_region),
        aws_bucket = COALESCE(?, aws_bucket)
       WHERE id = ?`,
      [
        email_notifications, 
        sms_notifications, 
        phone_number, 
        country_code, 
        detection_threshold, 
        aws_region, 
        aws_bucket, 
        GLOBAL_SETTINGS_ID
      ]
    );

    const updatedSettings = await db.get('SELECT * FROM settings WHERE id = ?', [GLOBAL_SETTINGS_ID]);
    res.json({ success: true, settings: updatedSettings });
  } catch (error) {
    console.error('[SettingsRoute] PUT error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

module.exports = router;
