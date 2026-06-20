/**
 * migrate-multiuser.js
 *
 * Safe, idempotent migration to add multi-user data isolation to VisionVault-AI.
 * - Adds user_id columns to all data tables (ADD COLUMN IF NOT EXISTS)
 * - Creates indexes for performance
 * - Backfills existing rows with user_id = 'user_default_admin'
 * - Converts settings from global single row → per-user rows
 *
 * Usage: node backend/migrate-multiuser.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || 'postgresql://localhost:5432/visionvault';
const pool = new Pool({ connectionString });

const ADMIN_USER_ID = 'user_default_admin';

function log(msg) {
  console.log(`[Migration] ${new Date().toISOString()} | ${msg}`);
}

async function run() {
  const client = await pool.connect();
  log('Connected to PostgreSQL.');

  try {
    await client.query('BEGIN');
    log('Transaction started.');

    // ── Step 1: Ensure users table exists & admin user exists ─────────────────
    log('Step 1: Verifying users table and admin account...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        username VARCHAR(100) UNIQUE,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(50) DEFAULT 'VIEWER',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      )
    `);

    const adminCheck = await client.query(`SELECT id FROM users WHERE id = $1`, [ADMIN_USER_ID]);
    if (adminCheck.rowCount === 0) {
      const bcrypt = require('bcrypt');
      const hash = await bcrypt.hash('admin123', 10);
      await client.query(
        `INSERT INTO users (id, name, username, email, password_hash, role)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [ADMIN_USER_ID, 'System Administrator', 'admin', 'admin@visionvault.local', hash, 'ADMIN']
      );
      log('Admin user created.');
    } else {
      log('Admin user already exists.');
    }

    // ── Step 2: Add user_id column to all data tables ────────────────────────
    log('Step 2: Adding user_id columns...');

    const tables = [
      'sessions',
      'live_stream_sessions',
      'identities',
      'detected_faces',
      'video_history',
      'daily_logs',
      'persons',
      'session_people',
      'live_stream_faces',
      'notifications',
    ];

    for (const table of tables) {
      try {
        await client.query(
          `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE`
        );
        log(`  ✅ ${table}.user_id column ensured.`);
      } catch (err) {
        // Table may not exist yet (e.g. if running before initDb) — skip gracefully
        log(`  ⚠️  ${table}: ${err.message.split('\n')[0]}`);
      }
    }

    // ── Step 3: Backfill existing rows with admin user_id ────────────────────
    log('Step 3: Backfilling existing records with admin user_id...');

    for (const table of tables) {
      try {
        const result = await client.query(
          `UPDATE ${table} SET user_id = $1 WHERE user_id IS NULL`,
          [ADMIN_USER_ID]
        );
        if (result.rowCount > 0) {
          log(`  ✅ ${table}: backfilled ${result.rowCount} row(s).`);
        } else {
          log(`  ─  ${table}: no rows to backfill.`);
        }
      } catch (err) {
        log(`  ⚠️  ${table} backfill skipped: ${err.message.split('\n')[0]}`);
      }
    }

    // ── Step 4: Create performance indexes ───────────────────────────────────
    log('Step 4: Creating user_id indexes...');

    const indexDefs = [
      { name: 'idx_sessions_user_id',            table: 'sessions',             col: 'user_id' },
      { name: 'idx_live_stream_sessions_user_id', table: 'live_stream_sessions', col: 'user_id' },
      { name: 'idx_identities_user_id',           table: 'identities',           col: 'user_id' },
      { name: 'idx_detected_faces_user_id',       table: 'detected_faces',       col: 'user_id' },
      { name: 'idx_daily_logs_user_id',           table: 'daily_logs',           col: 'user_id' },
      { name: 'idx_persons_user_id',              table: 'persons',              col: 'user_id' },
      { name: 'idx_notifications_user_id',        table: 'notifications',        col: 'user_id' },
    ];

    for (const { name, table, col } of indexDefs) {
      try {
        await client.query(`CREATE INDEX IF NOT EXISTS ${name} ON ${table}(${col})`);
        log(`  ✅ Index ${name} ensured.`);
      } catch (err) {
        log(`  ⚠️  Index ${name}: ${err.message.split('\n')[0]}`);
      }
    }

    // ── Step 5: Per-user settings migration ──────────────────────────────────
    log('Step 5: Migrating settings to per-user model...');

    // Ensure settings table has a user_id column
    try {
      await client.query(`ALTER TABLE settings ADD COLUMN IF NOT EXISTS user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE`);
      log('  ✅ settings.user_id column ensured.');
    } catch (err) {
      log(`  ⚠️  settings.user_id: ${err.message.split('\n')[0]}`);
    }

    // Copy global_config row to admin's row if it exists
    const globalSettings = await client.query(`SELECT * FROM settings WHERE id = 'global_config'`);
    if (globalSettings.rowCount > 0) {
      const gs = globalSettings.rows[0];
      await client.query(
        `INSERT INTO settings (id, user_id, email_notifications, sms_notifications, phone_number, country_code, detection_threshold, aws_region, aws_bucket)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET user_id = EXCLUDED.user_id`,
        [
          ADMIN_USER_ID, ADMIN_USER_ID,
          gs.email_notifications, gs.sms_notifications,
          gs.phone_number, gs.country_code,
          gs.detection_threshold, gs.aws_region, gs.aws_bucket
        ]
      );
      log('  ✅ Global settings copied to admin user row.');
    } else {
      // Ensure admin has a default settings row
      await client.query(
        `INSERT INTO settings (id, user_id, email_notifications, sms_notifications, detection_threshold)
         VALUES ($1, $2, false, false, 0.65)
         ON CONFLICT (id) DO NOTHING`,
        [ADMIN_USER_ID, ADMIN_USER_ID]
      );
      log('  ✅ Default admin settings row created.');
    }

    // ── Step 6: Add user_id to password_reset_tokens if it exists ───────────
    try {
      await client.query(`ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS user_id VARCHAR(100)`);
      log('Step 6: password_reset_tokens.user_id ensured.');
    } catch (err) {
      log(`Step 6: password_reset_tokens skipped: ${err.message.split('\n')[0]}`);
    }

    await client.query('COMMIT');
    log('✅ Migration committed successfully!');
    log('');
    log('Summary:');
    log('  • user_id columns added to all data tables');
    log('  • Existing records backfilled with admin user_id');
    log('  • Performance indexes created');
    log('  • Settings converted to per-user model');
    log('');
    log('Default admin credentials:');
    log('  Email:    admin@visionvault.local');
    log('  Username: admin');
    log('  Password: admin123');

  } catch (err) {
    await client.query('ROLLBACK');
    log(`❌ Migration failed. Transaction rolled back.`);
    log(`Error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
    log('Database connection closed.');
  }
}

run();
