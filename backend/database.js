const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const dbPath = path.join(__dirname, "database.sqlite");
console.log(`[Database] Initializing SQLite database at: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("[Database] Error opening SQLite database:", err.message);
  } else {
    console.log("[Database] Connected successfully to SQLite database.");
  }
});

// Create tables on startup
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS detected_faces (
      id TEXT PRIMARY KEY,
      face_signature TEXT NOT NULL,
      upload_count INTEGER DEFAULT 1,
      s3_url TEXT NOT NULL,
      last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error("[Database] Error creating detected_faces table:", err.message);
    } else {
      console.log("[Database] 'detected_faces' table is ready.");
    }
  });
  db.run(`
    CREATE TABLE IF NOT EXISTS video_history (
      id TEXT PRIMARY KEY,
      video_filename TEXT NOT NULL,
      frames_analyzed INTEGER DEFAULT 0,
      humans_detected INTEGER DEFAULT 0,
      faces_registered INTEGER DEFAULT 0,
      faces_recognized INTEGER DEFAULT 0,
      processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error("[Database] Error creating video_history table:", err.message);
    } else {
      console.log("[Database] 'video_history' table is ready.");
    }
  });
  db.run(`
    CREATE TABLE IF NOT EXISTS live_stream_sessions (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ended_at TEXT NOT NULL,
      duration_ms INTEGER DEFAULT 0,
      total_entries INTEGER DEFAULT 0,
      total_exits INTEGER DEFAULT 0,
      unique_faces_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error("[Database] Error creating live_stream_sessions table:", err.message);
    } else {
      console.log("[Database] 'live_stream_sessions' table is ready.");
    }
  });
  db.run(`
    CREATE TABLE IF NOT EXISTS live_stream_faces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES live_stream_sessions(id),
      identity_id TEXT NOT NULL,
      appearance_count INTEGER DEFAULT 1,
      s3_url TEXT,
      first_seen TEXT,
      last_seen TEXT
    )
  `, (err) => {
    if (err) {
      console.error("[Database] Error creating live_stream_faces table:", err.message);
    } else {
      console.log("[Database] 'live_stream_faces' table is ready.");
    }
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS persons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      identity_id TEXT UNIQUE,
      registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error("[Database] Error creating persons table:", err.message);
    } else {
      console.log("[Database] 'persons' table is ready.");
    }
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS movement_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identity_id TEXT NOT NULL,
      person_name TEXT DEFAULT 'Unknown',
      event_type TEXT NOT NULL,
      entry_count INTEGER DEFAULT 0,
      exit_count INTEGER DEFAULT 0,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error("[Database] Error creating movement_events table:", err.message);
    } else {
      console.log("[Database] 'movement_events' table is ready.");
    }
  });
});

// Wrap callback-based sqlite3 methods in Promises for cleaner async/await usage
const query = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  close() {
    return new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

module.exports = query;
