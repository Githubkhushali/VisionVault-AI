const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL || "postgresql://localhost:5432/visionvault";
console.log(`[Database] Connecting to PostgreSQL database...`);

const pool = new Pool({
  connectionString,
});

pool.on("error", (err) => {
  console.error("[Database] Unexpected error on idle PostgreSQL client:", err.message);
});

// Helper to convert SQLite `?` syntax to PostgreSQL `$1, $2` syntax
function convertSql(sql) {
  let index = 1;
  return sql.replace(/\?/g, () => `$${index++}`);
}

const query = {
  async run(sql, params = []) {
    const pgSql = convertSql(sql);
    try {
      const res = await pool.query(pgSql, params);
      return { lastID: null, changes: res.rowCount };
    } catch (err) {
      console.error(`[Database] Error running query: ${sql}`, err.message);
      throw err;
    }
  },

  async get(sql, params = []) {
    const pgSql = convertSql(sql);
    try {
      const res = await pool.query(pgSql, params);
      return res.rows[0] || null;
    } catch (err) {
      console.error(`[Database] Error getting row: ${sql}`, err.message);
      throw err;
    }
  },

  async all(sql, params = []) {
    const pgSql = convertSql(sql);
    try {
      const res = await pool.query(pgSql, params);
      return res.rows;
    } catch (err) {
      console.error(`[Database] Error getting rows: ${sql}`, err.message);
      throw err;
    }
  },

  async close() {
    await pool.end();
    console.log("[Database] PostgreSQL connection pool closed.");
  }
};

// Database Initialization (Auto-migrations)
const initDb = async () => {
  try {
    // 1. Backward-compatible detected_faces table
    await query.run(`
      CREATE TABLE IF NOT EXISTS detected_faces (
        id VARCHAR(100) PRIMARY KEY,
        face_signature TEXT NOT NULL,
        upload_count INTEGER DEFAULT 1,
        s3_url TEXT NOT NULL,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Backward-compatible video_history table
    await query.run(`
      CREATE TABLE IF NOT EXISTS video_history (
        id VARCHAR(100) PRIMARY KEY,
        video_filename TEXT NOT NULL,
        frames_analyzed INTEGER DEFAULT 0,
        humans_detected INTEGER DEFAULT 0,
        faces_registered INTEGER DEFAULT 0,
        faces_recognized INTEGER DEFAULT 0,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. Phase 7: sessions table
    await query.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id VARCHAR(100) PRIMARY KEY,
        filename TEXT NOT NULL,
        type VARCHAR(10) NOT NULL,
        s3_url TEXT,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total_frames INTEGER DEFAULT 1,
        people_count INTEGER DEFAULT 0,
        face_count INTEGER DEFAULT 0,
        unique_identities_count INTEGER DEFAULT 0,
        average_confidence NUMERIC(6,4)
      );
    `);

    // 4. Phase 7: identities table
    await query.run(`
      CREATE TABLE IF NOT EXISTS identities (
        id VARCHAR(100) PRIMARY KEY,
        canonical_face_url TEXT,
        first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        total_appearances INTEGER DEFAULT 1
      );
    `);

    await query.run(`
      CREATE TABLE IF NOT EXISTS persons (
        identity_id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL
      );
    `);

    // 5. Phase 7: session_people table
    await query.run(`
      CREATE TABLE IF NOT EXISTS session_people (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(100) REFERENCES sessions(id) ON DELETE CASCADE,
        track_id INTEGER,
        average_confidence NUMERIC(6,4),
        face_count INTEGER DEFAULT 0,
        best_face_confidence NUMERIC(6,4),
        identity_id VARCHAR(100),
        s3_crop_url TEXT,
        frames_appeared INTEGER DEFAULT 1,
        reentries INTEGER DEFAULT 0
      );
    `);

    // 6. live_stream_sessions table
    await query.run(`
      CREATE TABLE IF NOT EXISTS live_stream_sessions (
        id VARCHAR(100) PRIMARY KEY,
        started_at TIMESTAMP,
        ended_at TIMESTAMP,
        duration_ms BIGINT,
        total_entries INTEGER DEFAULT 0,
        total_exits INTEGER DEFAULT 0,
        unique_faces_count INTEGER DEFAULT 0,
        s3_url TEXT
      );
    `);

    // 7. live_stream_faces table
    await query.run(`
      CREATE TABLE IF NOT EXISTS live_stream_faces (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(100) REFERENCES live_stream_sessions(id) ON DELETE CASCADE,
        identity_id VARCHAR(100),
        appearance_count INTEGER DEFAULT 1,
        s3_url TEXT,
        first_seen TIMESTAMP,
        last_seen TIMESTAMP
      );
    `);

    // 8. daily_logs — per-person per-day aggregates (mirrors SQLite daily_person_log)
    await query.run(`
      CREATE TABLE IF NOT EXISTS daily_logs (
        date DATE NOT NULL,
        person_id VARCHAR(100) NOT NULL,
        name VARCHAR(255),
        first_seen TIME,
        last_seen TIME,
        entry_count INTEGER DEFAULT 1,
        face_url TEXT,
        PRIMARY KEY (date, person_id)
      );
    `);

    // 9. Extend identities with quality + s3 person folder
    await query.run(`ALTER TABLE identities ADD COLUMN IF NOT EXISTS embedding_quality NUMERIC(8,4);`);
    await query.run(`ALTER TABLE identities ADD COLUMN IF NOT EXISTS s3_person_folder TEXT;`);

    // 10. Users table for authentication
    await query.run(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        username VARCHAR(100) UNIQUE,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(50) DEFAULT 'VIEWER',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP
      );
    `);
    // Safe migration: add username column if it was created without it
    await query.run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(100) UNIQUE;`);

    // 10b. Add user_id foreign key to all data tables (multi-user isolation)
    const userIdTables = [
      'sessions', 'live_stream_sessions', 'identities', 'detected_faces',
      'video_history', 'daily_logs', 'persons', 'session_people',
      'live_stream_faces', 'notifications'
    ];
    for (const tbl of userIdTables) {
      await query.run(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE;`);
    }

    // 10c. Performance indexes for user_id lookups
    const userIdIndexes = [
      ['idx_sessions_user_id',            'sessions',             'user_id'],
      ['idx_live_stream_sessions_user_id','live_stream_sessions',  'user_id'],
      ['idx_identities_user_id',          'identities',           'user_id'],
      ['idx_detected_faces_user_id',      'detected_faces',       'user_id'],
      ['idx_daily_logs_user_id',          'daily_logs',           'user_id'],
      ['idx_persons_user_id',             'persons',              'user_id'],
      ['idx_notifications_user_id',       'notifications',        'user_id'],
    ];
    for (const [idxName, tbl, col] of userIdIndexes) {
      await query.run(`CREATE INDEX IF NOT EXISTS ${idxName} ON ${tbl}(${col});`);
    }

    // 11. Login Sessions table
    await query.run(`
      CREATE TABLE IF NOT EXISTS login_sessions (
        id VARCHAR(100) PRIMARY KEY,
        user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
        device TEXT,
        ip_address VARCHAR(50),
        login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 12a. Password Reset Tokens table (for forgot-password flow)
    await query.run(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(200) UNIQUE NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 12. Notifications table
    await query.run(`
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR(100) PRIMARY KEY,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        severity VARCHAR(20) DEFAULT 'INFO',
        read_status BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 13. Settings table
    await query.run(`
      CREATE TABLE IF NOT EXISTS settings (
        id VARCHAR(50) PRIMARY KEY,
        email_notifications BOOLEAN DEFAULT FALSE,
        sms_notifications BOOLEAN DEFAULT FALSE,
        phone_number VARCHAR(50),
        country_code VARCHAR(10),
        detection_threshold NUMERIC(5,2) DEFAULT 0.65,
        aws_region VARCHAR(100),
        aws_bucket VARCHAR(255)
      );
    `);

    // Initialize default admin if no users exist
    const { rows } = await pool.query('SELECT COUNT(*) FROM users');
    if (parseInt(rows[0].count) === 0) {
      const bcrypt = require('bcrypt');
      const defaultHash = await bcrypt.hash('admin123', 10);
      await query.run(
        'INSERT INTO users (id, name, username, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
        ['user_default_admin', 'System Administrator', 'admin', 'admin@visionvault.local', defaultHash, 'ADMIN']
      );
      console.log('[Database] ✅ Default ADMIN user created:');
      console.log('[Database]   Email:    admin@visionvault.local');
      console.log('[Database]   Username: admin');
      console.log('[Database]   Password: admin123');
    }

    console.log("[Database] Connected successfully to PostgreSQL database. All tables verified.");
  } catch (err) {
    console.error("[Database] PostgreSQL tables initialization failed:", err.message);
  }
};

// Fire and forget startup initialization
initDb();

module.exports = query;
