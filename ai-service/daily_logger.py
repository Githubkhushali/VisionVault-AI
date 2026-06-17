"""
daily_logger.py — Day-wise Person Appearance Tracker
=====================================================
Maintains a SQLite table 'daily_person_log' that tracks how many times
each unique person appeared on each day, plus first/last seen times.

Table schema:
  daily_person_log(
    date        TEXT,          -- 'YYYY-MM-DD'
    person_id   TEXT,          -- e.g. 'person_001' or legacy 'id_38637...'
    first_seen  TEXT,          -- 'HH:MM' (wall clock, local)
    last_seen   TEXT,          -- 'HH:MM' (wall clock, local)
    entry_count INTEGER,       -- incremented on each appearance
    name        TEXT,          -- nullable, updated when name is registered
    PRIMARY KEY (date, person_id)
  )

Usage:
    from daily_logger import DailyLogger
    dl = DailyLogger(db_path)
    dl.log_appearance('person_001', name='Khushali')
    rows = dl.get_day_log('2026-06-17')
"""

import sqlite3
import logging
import threading
from datetime import datetime

logger = logging.getLogger(__name__)

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS daily_person_log (
    date        TEXT NOT NULL,
    person_id   TEXT NOT NULL,
    first_seen  TEXT NOT NULL,
    last_seen   TEXT NOT NULL,
    entry_count INTEGER NOT NULL DEFAULT 1,
    name        TEXT,
    PRIMARY KEY (date, person_id)
);
"""

_UPSERT = """
INSERT INTO daily_person_log (date, person_id, first_seen, last_seen, entry_count, name)
VALUES (?, ?, ?, ?, 1, ?)
ON CONFLICT(date, person_id) DO UPDATE SET
    last_seen   = excluded.last_seen,
    entry_count = daily_person_log.entry_count + 1,
    name        = COALESCE(excluded.name, daily_person_log.name);
"""

_UPDATE_NAME = """
UPDATE daily_person_log SET name = ? WHERE person_id = ?;
"""

_SELECT_DAY = """
SELECT date, person_id, first_seen, last_seen, entry_count, name
FROM daily_person_log
WHERE date = ?
ORDER BY entry_count DESC;
"""

_SELECT_DAYS = """
SELECT DISTINCT date FROM daily_person_log ORDER BY date DESC LIMIT 30;
"""

_HOURLY_STATS = """
SELECT
    substr(first_seen, 1, 2) AS hour,
    COUNT(*) AS detections
FROM daily_person_log
WHERE date = ?
GROUP BY hour
ORDER BY hour;
"""

_TOP_PEOPLE = """
SELECT person_id, name, SUM(entry_count) AS total
FROM daily_person_log
WHERE date >= date('now','-7 days')
GROUP BY person_id, name
ORDER BY total DESC
LIMIT 10;
"""


class DailyLogger:
    """Thread-safe day-wise appearance logger."""

    def __init__(self, db_path: str):
        self._db_path = db_path
        self._lock = threading.Lock()
        self._init_table()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_table(self):
        try:
            with self._lock:
                conn = self._connect()
                conn.execute(_CREATE_TABLE)
                conn.commit()
                conn.close()
            logger.info("[DailyLogger] Table 'daily_person_log' ready.")
        except Exception as e:
            logger.error(f"[DailyLogger] Table init failed: {e}")

    def log_appearance(self, person_id: str, name: str = None):
        """Record (or increment) an appearance for today."""
        now = datetime.now()
        date_str = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H:%M")
        try:
            with self._lock:
                conn = self._connect()
                conn.execute(_UPSERT, (date_str, person_id, time_str, time_str, name))
                conn.commit()
                conn.close()
        except Exception as e:
            logger.error(f"[DailyLogger] log_appearance failed for {person_id}: {e}")

    def update_name(self, person_id: str, name: str):
        """Backfill the name for all existing rows of this person."""
        try:
            with self._lock:
                conn = self._connect()
                conn.execute(_UPDATE_NAME, (name, person_id))
                conn.commit()
                conn.close()
        except Exception as e:
            logger.error(f"[DailyLogger] update_name failed for {person_id}: {e}")

    def get_day_log(self, date_str: str) -> list:
        """Return all rows for a given date as list of dicts."""
        try:
            with self._lock:
                conn = self._connect()
                rows = conn.execute(_SELECT_DAY, (date_str,)).fetchall()
                conn.close()
                return [dict(r) for r in rows]
        except Exception as e:
            logger.error(f"[DailyLogger] get_day_log failed: {e}")
            return []

    def get_available_dates(self) -> list:
        """Return list of dates that have log entries (up to 30)."""
        try:
            with self._lock:
                conn = self._connect()
                rows = conn.execute(_SELECT_DAYS).fetchall()
                conn.close()
                return [r["date"] for r in rows]
        except Exception as e:
            logger.error(f"[DailyLogger] get_available_dates failed: {e}")
            return []

    def get_hourly_stats(self, date_str: str) -> list:
        """Return hour-wise detection count for a given date."""
        try:
            with self._lock:
                conn = self._connect()
                rows = conn.execute(_HOURLY_STATS, (date_str,)).fetchall()
                conn.close()
                # Fill all 24 hours
                hour_map = {r["hour"]: r["detections"] for r in rows}
                return [
                    {"hour": f"{h:02d}", "detections": hour_map.get(f"{h:02d}", 0)}
                    for h in range(24)
                ]
        except Exception as e:
            logger.error(f"[DailyLogger] get_hourly_stats failed: {e}")
            return []

    def get_day_summary(self, date_str: str) -> dict:
        """Return summary stats for a given date."""
        rows = self.get_day_log(date_str)
        if not rows:
            return {
                "date": date_str,
                "totalUniquePeople": 0,
                "totalEntries": 0,
                "returningVisitors": 0,
                "unknownVisitors": 0,
            }
        total_entries = sum(r["entry_count"] for r in rows)
        returning = sum(1 for r in rows if r["entry_count"] > 1)
        unknown = sum(1 for r in rows if not r["name"])
        return {
            "date": date_str,
            "totalUniquePeople": len(rows),
            "totalEntries": total_entries,
            "returningVisitors": returning,
            "unknownVisitors": unknown,
        }

    def get_top_people(self) -> list:
        """Return top people by appearances in last 7 days."""
        try:
            with self._lock:
                conn = self._connect()
                rows = conn.execute(_TOP_PEOPLE).fetchall()
                conn.close()
                return [dict(r) for r in rows]
        except Exception as e:
            logger.error(f"[DailyLogger] get_top_people failed: {e}")
            return []

    def get_daily_trend(self, days: int = 7) -> list:
        """Return per-day unique-person count for last N days."""
        try:
            with self._lock:
                conn = self._connect()
                rows = conn.execute("""
                    SELECT date, COUNT(DISTINCT person_id) AS unique_people, SUM(entry_count) AS total_entries
                    FROM daily_person_log
                    WHERE date >= date('now', ?)
                    GROUP BY date ORDER BY date ASC
                """, (f"-{days} days",)).fetchall()
                conn.close()
                return [dict(r) for r in rows]
        except Exception as e:
            logger.error(f"[DailyLogger] get_daily_trend failed: {e}")
            return []
