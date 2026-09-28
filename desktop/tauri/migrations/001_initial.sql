-- REWIND Desktop Ultimate: SQLite WAL Schema
-- Fast, local-first persistence with FTS5 full-text indexing and LRU candidate view.

PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -16000; -- 16MB cache
PRAGMA temp_store = MEMORY;

-- Main Snapshots Table
CREATE TABLE IF NOT EXISTS snapshots (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ts            INTEGER NOT NULL,               -- Unix epoch ms
    pid           INTEGER NOT NULL,               -- Process ID
    hwnd          INTEGER NOT NULL,               -- Window handle
    exe_path      TEXT NOT NULL,                  -- C:\path\to\app.exe
    process_name  TEXT NOT NULL,                  -- app.exe
    title         TEXT NOT NULL,                  -- Window Title
    url           TEXT,                           -- Browser URL (if active)
    workdir       TEXT,                           -- Working directory
    bounds_x      INTEGER NOT NULL DEFAULT 0,
    bounds_y      INTEGER NOT NULL DEFAULT 0,
    bounds_w      INTEGER NOT NULL DEFAULT 800,
    bounds_h      INTEGER NOT NULL DEFAULT 600,
    monitor_id    INTEGER NOT NULL DEFAULT 0,
    dpi_scale     REAL NOT NULL DEFAULT 1.0,
    thumb_path    TEXT NOT NULL,                  -- Relative path to encrypted WebP file
    thumb_size    INTEGER NOT NULL DEFAULT 0,     -- Size in bytes
    phash         INTEGER,                        -- 64-bit perceptual hash for deduplication
    protected     INTEGER NOT NULL DEFAULT 0,     -- 1 if sensitive/blanked, 0 otherwise
    accessed_at   INTEGER NOT NULL,               -- Epoch ms for LRU eviction
    UNIQUE(ts, hwnd)
);

-- Indexes for lightning-fast range queries and LRU eviction
CREATE INDEX IF NOT EXISTS idx_snapshots_ts ON snapshots(ts DESC);
CREATE INDEX IF NOT EXISTS idx_snapshots_hwnd ON snapshots(hwnd);
CREATE INDEX IF NOT EXISTS idx_snapshots_accessed ON snapshots(accessed_at ASC);
CREATE INDEX IF NOT EXISTS idx_snapshots_proc ON snapshots(process_name);

-- FTS5 Full-Text Search Virtual Table
CREATE VIRTUAL TABLE IF NOT EXISTS snapshots_fts USING fts5(
    title,
    url,
    process_name,
    exe_path,
    content='snapshots',
    content_rowid='id'
);

-- Triggers to automatically keep FTS5 synchronized with snapshots table
CREATE TRIGGER IF NOT EXISTS snapshots_ai AFTER INSERT ON snapshots BEGIN
    INSERT INTO snapshots_fts(rowid, title, url, process_name, exe_path)
    VALUES (NEW.id, NEW.title, NEW.url, NEW.process_name, NEW.exe_path);
END;

CREATE TRIGGER IF NOT EXISTS snapshots_ad AFTER DELETE ON snapshots BEGIN
    INSERT INTO snapshots_fts(snapshots_fts, rowid, title, url, process_name, exe_path)
    VALUES ('delete', OLD.id, OLD.title, OLD.url, OLD.process_name, OLD.exe_path);
END;

CREATE TRIGGER IF NOT EXISTS snapshots_au AFTER UPDATE ON snapshots BEGIN
    INSERT INTO snapshots_fts(snapshots_fts, rowid, title, url, process_name, exe_path)
    VALUES ('delete', OLD.id, OLD.title, OLD.url, OLD.process_name, OLD.exe_path);
    INSERT INTO snapshots_fts(rowid, title, url, process_name, exe_path)
    VALUES (NEW.id, NEW.title, NEW.url, NEW.process_name, NEW.exe_path);
END;

-- Clipboard History Table (Privacy-filtered)
CREATE TABLE IF NOT EXISTS clipboards (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ts            INTEGER NOT NULL,
    snapshot_id   INTEGER,
    process_name  TEXT,
    content_text  TEXT NOT NULL,
    content_hash  TEXT NOT NULL UNIQUE,
    is_sensitive  INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(snapshot_id) REFERENCES snapshots(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_clipboards_ts ON clipboards(ts DESC);

-- LRU Eviction View (Identifies oldest unaccessed items when size cap is exceeded)
CREATE VIEW IF NOT EXISTS lru_candidates AS
SELECT id, thumb_path, thumb_size, accessed_at
FROM snapshots
WHERE protected = 0
ORDER BY accessed_at ASC;

-- Full-State Blobs Table (Stores encrypted terminal scrollback & deep application state <= 5 MiB)
CREATE TABLE IF NOT EXISTS full_state_blobs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    snapshot_id       INTEGER NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE,
    app_type          TEXT NOT NULL,               -- 'terminal', 'generic'
    uncompressed_size INTEGER NOT NULL,            -- uncompressed bytes
    payload           BLOB NOT NULL,               -- gzip compressed + DPAPI encrypted
    created_at        INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_full_state_snapshot ON full_state_blobs(snapshot_id);

