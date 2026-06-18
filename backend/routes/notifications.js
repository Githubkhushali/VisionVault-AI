const express = require('express');
const router = express.Router();
const db = require('../db-postgres');
const { authMiddleware } = require('../middleware/auth');

// GET /api/notifications
router.get('/', authMiddleware, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const notifications = await db.all(
      'SELECT * FROM notifications ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    res.json({ success: true, notifications });
  } catch (error) {
    console.error('[NotificationsRoute] GET error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// POST /api/notifications/read
// Expects { notificationIds: ['id1', 'id2'] }
router.post('/read', authMiddleware, async (req, res) => {
  try {
    const { notificationIds } = req.body;
    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      return res.status(400).json({ success: false, error: 'notificationIds array is required.' });
    }

    // Convert array to a parameterized IN clause. 
    // Wait, since we wrote our own `db.run` wrapper, doing dynamic IN clauses with sqlite-like wrapper is tricky.
    // Better to loop or use the raw pool if needed, but simple loop is fine for small batches.
    for (const id of notificationIds) {
      await db.run('UPDATE notifications SET read_status = TRUE WHERE id = ?', [id]);
    }

    res.json({ success: true, message: 'Notifications marked as read.' });
  } catch (error) {
    console.error('[NotificationsRoute] POST /read error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// DELETE /api/notifications/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await db.run('DELETE FROM notifications WHERE id = ?', [id]);
    res.json({ success: true, message: 'Notification deleted.' });
  } catch (error) {
    console.error('[NotificationsRoute] DELETE error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

module.exports = router;
