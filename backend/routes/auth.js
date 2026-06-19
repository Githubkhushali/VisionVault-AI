const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db-postgres');
const { authMiddleware } = require('../middleware/auth');

// ── Helpers ────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '24h';
const JWT_LONG_EXPIRES_IN = '30d';

function getJwtSecret() {
  if (!JWT_SECRET) {
    console.error('[Auth] ❌ CRITICAL: JWT_SECRET is not set in environment variables!');
    throw new Error('JWT_SECRET environment variable is missing. Authentication cannot proceed.');
  }
  return JWT_SECRET;
}

function log(level, event, details = {}) {
  const ts = new Date().toISOString();
  const detailStr = Object.entries(details)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  console.log(`[${ts}] [Auth] [${level}] ${event}${detailStr ? ' | ' + detailStr : ''}`);
}

// ── POST /api/auth/register ────────────────────────────────────
router.post('/register', async (req, res) => {
  const { name, username, email, password } = req.body;
  log('INFO', 'REGISTER_ATTEMPT', { email, username });

  // Validation
  if (!name || !email || !password) {
    log('WARN', 'REGISTER_MISSING_FIELDS', { name: !!name, email: !!email, password: !!password });
    return res.status(400).json({
      success: false,
      message: 'Full name, email, and password are required.'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      success: false,
      message: 'Password must be at least 6 characters long.'
    });
  }

  try {
    // Check existing email
    const existingEmail = await db.get('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existingEmail) {
      log('WARN', 'REGISTER_EMAIL_TAKEN', { email });
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    // Check existing username (if provided)
    const finalUsername = (username || email.split('@')[0]).toLowerCase().replace(/[^a-z0-9_]/g, '');
    const existingUsername = await db.get('SELECT id FROM users WHERE username = ?', [finalUsername]);
    if (existingUsername) {
      log('WARN', 'REGISTER_USERNAME_TAKEN', { username: finalUsername });
      return res.status(409).json({ success: false, message: `Username "${finalUsername}" is already taken. Please choose a different one.` });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    const userId = `usr_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;

    await db.run(
      'INSERT INTO users (id, name, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, name.trim(), finalUsername, email.toLowerCase().trim(), passwordHash, 'VIEWER']
    );

    log('INFO', 'REGISTER_SUCCESS', { userId, username: finalUsername, email });
    res.status(201).json({
      success: true,
      message: 'Account created successfully! You can now log in.',
      username: finalUsername
    });
  } catch (error) {
    log('ERROR', 'REGISTER_ERROR', { error: error.message });
    console.error('[Auth] Registration stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Registration failed due to a server error. Please try again.',
      debug: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

// ── POST /api/auth/login ──────────────────────────────────────
router.post('/login', async (req, res) => {
  const { identifier, email, username, password, rememberMe } = req.body;
  // Support all three field names for flexibility
  const loginId = (identifier || email || username || '').trim();

  log('INFO', 'LOGIN_ATTEMPT', { identifier: loginId });

  // Step 1: Input validation
  if (!loginId || !password) {
    log('WARN', 'LOGIN_MISSING_FIELDS', { hasIdentifier: !!loginId, hasPassword: !!password });
    return res.status(400).json({
      success: false,
      message: 'Email/username and password are required.'
    });
  }

  // Step 2: JWT secret check
  let secret;
  try {
    secret = getJwtSecret();
  } catch (jwtErr) {
    log('ERROR', 'LOGIN_JWT_SECRET_MISSING');
    return res.status(500).json({
      success: false,
      message: 'Authentication service is misconfigured. Please contact the administrator.',
      detail: 'JWT_SECRET environment variable is not set.'
    });
  }

  // Step 3: Database lookup (by email OR username)
  let user;
  try {
    const isEmail = loginId.includes('@');
    if (isEmail) {
      log('INFO', 'LOGIN_DB_QUERY', { method: 'email', identifier: loginId });
      user = await db.get('SELECT * FROM users WHERE email = ?', [loginId.toLowerCase()]);
    } else {
      log('INFO', 'LOGIN_DB_QUERY', { method: 'username', identifier: loginId });
      user = await db.get('SELECT * FROM users WHERE username = ?', [loginId.toLowerCase()]);
    }
  } catch (dbErr) {
    log('ERROR', 'LOGIN_DB_ERROR', { error: dbErr.message });
    console.error('[Auth] DB query stack:', dbErr.stack);
    return res.status(500).json({
      success: false,
      message: 'Database connection failed. Please try again in a moment.',
      detail: process.env.NODE_ENV !== 'production' ? dbErr.message : undefined
    });
  }

  // Step 4: User existence check
  if (!user) {
    log('WARN', 'LOGIN_USER_NOT_FOUND', { identifier: loginId });
    return res.status(401).json({
      success: false,
      message: 'No account found with that email or username. Please check and try again, or create a new account.'
    });
  }

  log('INFO', 'LOGIN_USER_FOUND', { userId: user.id, role: user.role });

  // Step 5: Password verification
  let passwordMatch;
  try {
    if (!user.password_hash) {
      log('ERROR', 'LOGIN_NO_PASSWORD_HASH', { userId: user.id });
      return res.status(500).json({
        success: false,
        message: 'Account configuration error. Please contact the administrator.'
      });
    }
    passwordMatch = await bcrypt.compare(password, user.password_hash);
  } catch (bcryptErr) {
    log('ERROR', 'LOGIN_BCRYPT_ERROR', { error: bcryptErr.message });
    return res.status(500).json({
      success: false,
      message: 'Password verification failed due to a server error. Please try again.',
      detail: process.env.NODE_ENV !== 'production' ? bcryptErr.message : undefined
    });
  }

  if (!passwordMatch) {
    log('WARN', 'LOGIN_WRONG_PASSWORD', { userId: user.id });
    return res.status(401).json({
      success: false,
      message: 'Incorrect password. Please try again or use "Forgot Password" to recover your account.'
    });
  }

  // Step 6: Generate JWT token
  let token;
  try {
    const expiresIn = rememberMe ? JWT_LONG_EXPIRES_IN : JWT_EXPIRES_IN;
    token = jwt.sign(
      { id: user.id, role: user.role, name: user.name, email: user.email, username: user.username },
      secret,
      { expiresIn }
    );
    log('INFO', 'LOGIN_TOKEN_GENERATED', { userId: user.id, expiresIn });
  } catch (jwtErr) {
    log('ERROR', 'LOGIN_TOKEN_ERROR', { error: jwtErr.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to create authentication token. Please try again.',
      detail: process.env.NODE_ENV !== 'production' ? jwtErr.message : undefined
    });
  }

  // Step 7: Update last login (non-blocking — don't fail login if this fails)
  try {
    await db.run('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [user.id]);
  } catch (updateErr) {
    log('WARN', 'LOGIN_LAST_LOGIN_UPDATE_FAILED', { error: updateErr.message });
    // Non-critical — continue
  }

  // Step 8: Record login session (non-blocking)
  try {
    const sessionId = `sess_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const ipAddress = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const device = req.headers['user-agent'] || 'Unknown';
    await db.run(
      'INSERT INTO login_sessions (id, user_id, device, ip_address) VALUES (?, ?, ?, ?)',
      [sessionId, user.id, device, ipAddress]
    );
    log('INFO', 'LOGIN_SESSION_RECORDED', { sessionId, userId: user.id });
  } catch (sessionErr) {
    log('WARN', 'LOGIN_SESSION_RECORD_FAILED', { error: sessionErr.message });
    // Non-critical — continue with login
  }

  log('INFO', 'LOGIN_SUCCESS', { userId: user.id, username: user.username, role: user.role });

  res.json({
    success: true,
    message: 'Login successful.',
    token,
    user: {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role
    }
  });
});

// ── POST /api/auth/logout ──────────────────────────────────────
router.post('/logout', authMiddleware, (req, res) => {
  log('INFO', 'LOGOUT', { userId: req.user?.id });
  res.json({ success: true, message: 'Logged out successfully.' });
});

// ── GET /api/auth/me ──────────────────────────────────────────
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.get(
      'SELECT id, name, username, email, role, created_at, last_login FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json({ success: true, user });
  } catch (error) {
    log('ERROR', 'ME_ERROR', { error: error.message });
    res.status(500).json({ success: false, message: 'Failed to fetch user profile.' });
  }
});

// ── POST /api/auth/forgot-password ───────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  log('INFO', 'FORGOT_PASSWORD_ATTEMPT', { email });

  if (!email) {
    return res.status(400).json({ success: false, message: 'Email address is required.' });
  }

  // Always return success to prevent email enumeration
  const genericSuccess = {
    success: true,
    message: 'If an account with that email exists, a password reset link has been sent.'
  };

  try {
    const user = await db.get('SELECT id, name, email FROM users WHERE email = ?', [email.toLowerCase().trim()]);

    if (!user) {
      log('WARN', 'FORGOT_PASSWORD_EMAIL_NOT_FOUND', { email });
      return res.json(genericSuccess); // Don't reveal whether email exists
    }

    // Invalidate previous tokens for this user
    await db.run('DELETE FROM password_reset_tokens WHERE user_id = ?', [user.id]);

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.run(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, resetToken, expiresAt.toISOString()]
    );

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    log('INFO', 'FORGOT_PASSWORD_TOKEN_CREATED', { userId: user.id });

    // Try to send email via AWS SES
    let emailSent = false;
    try {
      const emailService = require('../services/emailService');
      if (emailService.sendPasswordResetEmail) {
        await emailService.sendPasswordResetEmail(user.email, user.name, resetUrl);
        emailSent = true;
        log('INFO', 'FORGOT_PASSWORD_EMAIL_SENT', { email: user.email });
      }
    } catch (emailErr) {
      log('WARN', 'FORGOT_PASSWORD_EMAIL_FAILED', { error: emailErr.message });
    }

    // In dev or when email fails: log the URL to console so it's not lost
    if (!emailSent) {
      console.log('\n========================================');
      console.log('[Auth] 🔑 PASSWORD RESET LINK (email not configured):');
      console.log(`  User: ${user.email}`);
      console.log(`  URL:  ${resetUrl}`);
      console.log('========================================\n');
    }

    res.json(genericSuccess);
  } catch (error) {
    log('ERROR', 'FORGOT_PASSWORD_ERROR', { error: error.message });
    console.error('[Auth] Forgot-password stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request. Please try again.',
      detail: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

// ── POST /api/auth/reset-password ────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  log('INFO', 'RESET_PASSWORD_ATTEMPT');

  if (!token || !password) {
    return res.status(400).json({ success: false, message: 'Reset token and new password are required.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ success: false, message: 'Password must be at least 6 characters long.' });
  }

  try {
    // Look up the token
    const resetRecord = await db.get(
      'SELECT * FROM password_reset_tokens WHERE token = ? AND used = FALSE',
      [token]
    );

    if (!resetRecord) {
      log('WARN', 'RESET_PASSWORD_INVALID_TOKEN');
      return res.status(400).json({
        success: false,
        message: 'Invalid or already-used reset link. Please request a new password reset.'
      });
    }

    // Check expiry
    if (new Date() > new Date(resetRecord.expires_at)) {
      log('WARN', 'RESET_PASSWORD_EXPIRED_TOKEN', { userId: resetRecord.user_id });
      await db.run('DELETE FROM password_reset_tokens WHERE id = ?', [resetRecord.id]);
      return res.status(400).json({
        success: false,
        message: 'This reset link has expired. Please request a new one.'
      });
    }

    // Hash and update password
    const newHash = await bcrypt.hash(password, 10);
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [newHash, resetRecord.user_id]);

    // Mark token as used
    await db.run('UPDATE password_reset_tokens SET used = TRUE WHERE id = ?', [resetRecord.id]);

    log('INFO', 'RESET_PASSWORD_SUCCESS', { userId: resetRecord.user_id });
    res.json({ success: true, message: 'Password reset successfully! You can now log in with your new password.' });
  } catch (error) {
    log('ERROR', 'RESET_PASSWORD_ERROR', { error: error.message });
    res.status(500).json({
      success: false,
      message: 'Failed to reset password. Please try again.',
      detail: process.env.NODE_ENV !== 'production' ? error.message : undefined
    });
  }
});

// ── GET /api/auth/health ──────────────────────────────────────
router.get('/health', async (req, res) => {
  const results = {
    timestamp: new Date().toISOString(),
    overall: 'ok',
    checks: {}
  };

  // 1. JWT Secret
  results.checks.jwt_secret = process.env.JWT_SECRET
    ? { status: 'ok', message: 'JWT_SECRET is set' }
    : { status: 'error', message: 'JWT_SECRET is MISSING — login will fail!' };

  // 2. Database connectivity
  try {
    await db.get('SELECT 1');
    results.checks.database = { status: 'ok', message: 'PostgreSQL connected' };
  } catch (dbErr) {
    results.checks.database = { status: 'error', message: `DB error: ${dbErr.message}` };
  }

  // 3. Users table exists and has at least one user
  try {
    const countRow = await db.get('SELECT COUNT(*) as cnt FROM users');
    results.checks.users_table = {
      status: 'ok',
      message: `Users table OK — ${countRow?.cnt ?? 0} user(s) found`
    };
  } catch (tableErr) {
    results.checks.users_table = { status: 'error', message: `Users table error: ${tableErr.message}` };
  }

  // 4. bcrypt sanity check
  try {
    const testHash = await bcrypt.hash('health_check_test', 1);
    const testVerify = await bcrypt.compare('health_check_test', testHash);
    results.checks.bcrypt = testVerify
      ? { status: 'ok', message: 'bcrypt hashing and comparison working' }
      : { status: 'error', message: 'bcrypt compare returned false — critical failure' };
  } catch (bcryptErr) {
    results.checks.bcrypt = { status: 'error', message: `bcrypt error: ${bcryptErr.message}` };
  }

  // 5. Token generation test
  try {
    const secret = process.env.JWT_SECRET || 'fallback_for_health_test';
    const testToken = jwt.sign({ test: true }, secret, { expiresIn: '1m' });
    jwt.verify(testToken, secret);
    results.checks.jwt_generation = { status: 'ok', message: 'JWT sign and verify working' };
  } catch (jwtErr) {
    results.checks.jwt_generation = { status: 'error', message: `JWT error: ${jwtErr.message}` };
  }

  // 6. Environment variables
  const envVars = ['JWT_SECRET', 'DATABASE_URL', 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'S3_BUCKET_NAME'];
  const missing = envVars.filter(v => !process.env[v]);
  results.checks.env_vars = missing.length === 0
    ? { status: 'ok', message: 'All required env vars present' }
    : { status: 'warn', message: `Missing env vars: ${missing.join(', ')}` };

  // Overall status
  const hasErrors = Object.values(results.checks).some(c => c.status === 'error');
  results.overall = hasErrors ? 'degraded' : 'ok';

  const httpStatus = hasErrors ? 503 : 200;
  res.status(httpStatus).json(results);
});

// ── GET /api/auth/debug/auth (dev/staging only) ───────────────
router.get('/debug/auth', async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ success: false, message: 'Debug endpoint disabled in production.' });
  }

  const { email, username } = req.query;
  if (!email && !username) {
    return res.status(400).json({ success: false, message: 'Pass ?email= or ?username= to test.' });
  }

  try {
    let user;
    if (email) {
      user = await db.get('SELECT id, name, username, email, role, created_at, last_login FROM users WHERE email = ?', [email]);
    } else {
      user = await db.get('SELECT id, name, username, email, role, created_at, last_login FROM users WHERE username = ?', [username]);
    }

    if (!user) {
      return res.json({ success: false, message: 'User not found in database.', query: { email, username } });
    }

    // Test token generation (no password — debug only)
    const secret = process.env.JWT_SECRET || 'fallback';
    const testToken = jwt.sign({ id: user.id, role: user.role }, secret, { expiresIn: '5m' });

    res.json({
      success: true,
      user: { id: user.id, name: user.name, username: user.username, email: user.email, role: user.role },
      jwt_secret_set: !!process.env.JWT_SECRET,
      test_token_generated: !!testToken,
      note: 'This endpoint is disabled in production.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
