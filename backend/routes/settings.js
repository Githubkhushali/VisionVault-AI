const express = require('express');
const router = express.Router();
const db = require('../db-postgres');
const { authMiddleware, requireRole } = require('../middleware/auth');

// ─── Auto-initialize settings for a user ────────────────────────
async function ensureUserSettings(userId) {
  try {
    const existing = await db.get('SELECT id FROM settings WHERE id = ?', [userId]);
    if (!existing) {
      await db.run(
        'INSERT INTO settings (id, user_id, email_notifications, sms_notifications, detection_threshold) VALUES (?, ?, ?, ?, ?)',
        [userId, userId, false, false, 0.65]
      );
    }
  } catch (error) {
    console.error('[SettingsRoute] Init error for user', userId, error.message);
  }
}

// GET /api/settings — returns the current user's settings
router.get('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    await ensureUserSettings(userId);
    const settings = await db.get('SELECT * FROM settings WHERE id = ?', [userId]);
    res.json({ success: true, settings });
  } catch (error) {
    console.error('[SettingsRoute] GET error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// PUT /api/settings — update the current user's settings
// Admins can optionally pass a ?userId= query to update another user's settings
router.put('/', authMiddleware, async (req, res) => {
  try {
    let targetUserId = req.user.id;

    // Admins can manage any user's settings via ?userId=
    if (req.user.role === 'ADMIN' && req.query.userId) {
      targetUserId = req.query.userId;
    }

    const {
      email_notifications, sms_notifications, phone_number,
      country_code, detection_threshold, aws_region, aws_bucket
    } = req.body;

    await ensureUserSettings(targetUserId);

    await db.run(
      `UPDATE settings SET
        email_notifications = COALESCE(?, email_notifications),
        sms_notifications   = COALESCE(?, sms_notifications),
        phone_number        = COALESCE(?, phone_number),
        country_code        = COALESCE(?, country_code),
        detection_threshold = COALESCE(?, detection_threshold),
        aws_region          = COALESCE(?, aws_region),
        aws_bucket          = COALESCE(?, aws_bucket)
       WHERE id = ?`,
      [
        email_notifications,
        sms_notifications,
        phone_number,
        country_code,
        detection_threshold,
        aws_region,
        aws_bucket,
        targetUserId
      ]
    );

    const updatedSettings = await db.get('SELECT * FROM settings WHERE id = ?', [targetUserId]);
    res.json({ success: true, settings: updatedSettings });
  } catch (error) {
    console.error('[SettingsRoute] PUT error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// GET /api/settings/all — Admin only: view all users' settings
router.get('/all', authMiddleware, requireRole(['ADMIN']), async (req, res) => {
  try {
    const allSettings = await db.all(`
      SELECT s.*, u.name as user_name, u.email as user_email
      FROM settings s
      LEFT JOIN users u ON u.id = s.user_id
      ORDER BY u.created_at DESC
    `);
    res.json({ success: true, settings: allSettings });
  } catch (error) {
    console.error('[SettingsRoute] GET /all error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

module.exports = router;
