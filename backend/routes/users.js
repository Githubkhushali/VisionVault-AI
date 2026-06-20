const express = require('express');
const router = express.Router();
const db = require('../db-postgres');
const { authMiddleware, requireRole } = require('../middleware/auth');

// ─── GET /api/users ─ Admin: list all users ─────────────────────
router.get('/', authMiddleware, requireRole(['ADMIN']), async (req, res) => {
  try {
    const users = await db.all(`
      SELECT
        u.id, u.name, u.username, u.email, u.role,
        u.created_at, u.last_login,
        COUNT(DISTINCT s.id)    AS session_count,
        COUNT(DISTINCT lss.id)  AS live_session_count,
        COUNT(DISTINCT i.id)    AS identity_count
      FROM users u
      LEFT JOIN sessions s ON s.user_id = u.id
      LEFT JOIN live_stream_sessions lss ON lss.user_id = u.id
      LEFT JOIN identities i ON i.user_id = u.id
      GROUP BY u.id, u.name, u.username, u.email, u.role, u.created_at, u.last_login
      ORDER BY u.created_at DESC
    `);

    const mapped = users.map(u => ({
      ...u,
      session_count:      parseInt(u.session_count || 0, 10),
      live_session_count: parseInt(u.live_session_count || 0, 10),
      identity_count:     parseInt(u.identity_count || 0, 10),
    }));

    res.json({ success: true, users: mapped });
  } catch (error) {
    console.error('[UsersRoute] GET / error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ─── GET /api/users/me ─ Current user profile ───────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.get(
      'SELECT id, name, username, email, role, created_at, last_login FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, user });
  } catch (error) {
    console.error('[UsersRoute] GET /me error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ─── GET /api/users/:id ─ Admin: get any user's profile + stats ─
router.get('/:id', authMiddleware, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const user = await db.get(
      'SELECT id, name, username, email, role, created_at, last_login FROM users WHERE id = ?',
      [id]
    );
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    // Fetch summary stats for this user
    const sessionsCount  = await db.get('SELECT COUNT(*) as count FROM sessions WHERE user_id = ?', [id]);
    const liveCount      = await db.get('SELECT COUNT(*) as count FROM live_stream_sessions WHERE user_id = ?', [id]);
    const identityCount  = await db.get('SELECT COUNT(*) as count FROM identities WHERE user_id = ?', [id]);

    res.json({
      success: true,
      user: {
        ...user,
        stats: {
          sessions:      parseInt(sessionsCount?.count || 0, 10),
          liveSessions:  parseInt(liveCount?.count || 0, 10),
          identities:    parseInt(identityCount?.count || 0, 10),
        }
      }
    });
  } catch (error) {
    console.error('[UsersRoute] GET /:id error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ─── PATCH /api/users/:id/role ─ Admin: change a user's role ────
router.patch('/:id/role', authMiddleware, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    const validRoles = ['ADMIN', 'SECURITY_OFFICER', 'VIEWER'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
    }
    // Prevent demoting yourself if you're the only admin
    if (id === req.user.id && role !== 'ADMIN') {
      return res.status(400).json({ success: false, message: 'Cannot demote your own admin account.' });
    }
    await db.run('UPDATE users SET role = ? WHERE id = ?', [role, id]);
    res.json({ success: true, message: `User role updated to ${role}.` });
  } catch (error) {
    console.error('[UsersRoute] PATCH /:id/role error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ─── DELETE /api/users/:id ─ Admin: delete user + all their data ─
router.delete('/:id', authMiddleware, requireRole(['ADMIN']), async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account.' });
    }

    const user = await db.get('SELECT id, name FROM users WHERE id = ?', [id]);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    // Data is cascade-deleted via ON DELETE CASCADE on all user_id foreign keys
    await db.run('DELETE FROM users WHERE id = ?', [id]);

    console.log(`[UsersRoute] Admin ${req.user.id} deleted user ${id} (${user.name})`);
    res.json({ success: true, message: `User "${user.name}" and all their data have been deleted.` });
  } catch (error) {
    console.error('[UsersRoute] DELETE /:id error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// ─── GET /api/users/sessions ─ Admin: login session audit log ───
router.get('/login/sessions', authMiddleware, requireRole(['ADMIN']), async (req, res) => {
  try {
    const sessions = await db.all(`
      SELECT s.id, s.device, s.ip_address, s.login_time,
             u.name as user_name, u.email as user_email
      FROM login_sessions s
      JOIN users u ON s.user_id = u.id
      ORDER BY s.login_time DESC
      LIMIT 100
    `);
    res.json({ success: true, sessions });
  } catch (error) {
    console.error('[UsersRoute] GET /login/sessions error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

module.exports = router;
