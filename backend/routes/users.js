const express = require('express');
const router = express.Router();
const db = require('../db-postgres');
const { authMiddleware, requireRole } = require('../middleware/auth');

// GET /api/users
// Admin only: List all users
router.get('/', authMiddleware, requireRole(['ADMIN']), async (req, res) => {
  try {
    const users = await db.all('SELECT id, name, email, role, created_at, last_login FROM users ORDER BY created_at DESC');
    res.json({ success: true, users });
  } catch (error) {
    console.error('[UsersRoute] /api/users error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// GET /api/sessions
// Admin only: List active login sessions
router.get('/sessions', authMiddleware, requireRole(['ADMIN']), async (req, res) => {
  try {
    const sessions = await db.all(`
      SELECT s.id, s.device, s.ip_address, s.login_time, u.name as user_name, u.email as user_email
      FROM login_sessions s
      JOIN users u ON s.user_id = u.id
      ORDER BY s.login_time DESC
      LIMIT 100
    `);
    res.json({ success: true, sessions });
  } catch (error) {
    console.error('[UsersRoute] /api/sessions error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

module.exports = router;
