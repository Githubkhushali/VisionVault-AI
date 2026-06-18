const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db-postgres');
const { authMiddleware } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev_only';
const JWT_EXPIRES_IN = '24h';

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, and password are required.' });
    }

    const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [email]);
    if (existingUser) {
      return res.status(409).json({ success: false, error: 'Email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = `usr_${crypto.randomUUID().substring(0, 16)}`;
    const userRole = role || 'VIEWER';

    await db.run(
      'INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      [userId, name, email, passwordHash, userRole]
    );

    res.status(201).json({ success: true, message: 'User registered successfully.' });
  } catch (error) {
    console.error('[AuthRoute] Registration error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    // Generate JWT
    const token = jwt.sign({ id: user.id, role: user.role, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Update last login
    await db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);

    // Record session
    const sessionId = `sess_${crypto.randomUUID().substring(0, 16)}`;
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const device = req.headers['user-agent'] || 'Unknown';

    await db.run(
      'INSERT INTO login_sessions (id, user_id, device, ip_address) VALUES (?, ?, ?, ?)',
      [sessionId, user.id, device, ipAddress]
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error('[AuthRoute] Login error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

// POST /api/auth/logout
router.post('/logout', authMiddleware, async (req, res) => {
  // Since we use stateless JWT, we rely on the client to discard the token.
  res.json({ success: true, message: 'Logged out successfully.' });
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.get('SELECT id, name, email, role, created_at, last_login FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }
    res.json({ success: true, user });
  } catch (error) {
    console.error('[AuthRoute] /me error:', error);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
});

module.exports = router;
