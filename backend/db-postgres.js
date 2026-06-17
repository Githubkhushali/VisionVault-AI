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

    console.log("[Database] Connected successfully to PostgreSQL database. All tables verified.");
  } catch (err) {
    console.error("[Database] PostgreSQL tables initialization failed:", err.message);
  }
};

// Fire and forget startup initialization
initDb();

module.exports = query;
