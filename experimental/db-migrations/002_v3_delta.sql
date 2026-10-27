-- REWIND v3.0 Schema Migration: Delta Time Machine
-- Adds: file_snapshots, blob_chunks, clipboard_history (enhanced), ocr_boxes

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Content-Addressable Blob Chunks
-- ─────────────────────────────────────────────────────────────────────────────

-- Individual deduplicated content chunks stored on disk as ~/.rewind/blobs/<sha256>
CREATE TABLE IF NOT EXISTS blob_chunks (
    sha256      TEXT PRIMARY KEY,        -- SHA-256 hex digest of the uncompressed chunk
    size_bytes  INTEGER NOT NULL,        -- Uncompressed size
    zstd_size   INTEGER NOT NULL,        -- Compressed size on disk
    created_at  INTEGER NOT NULL         -- Unix epoch ms
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. File Snapshots (CAS manifest per moment)
-- ─────────────────────────────────────────────────────────────────────────────

-- One row per (moment × file) snapshot recorded by the filesystem watcher.
CREATE TABLE IF NOT EXISTS file_snapshots (
    id          TEXT PRIMARY KEY,        -- UUID
    moment_id   TEXT REFERENCES moments(id) ON DELETE SET NULL,
    file_path   TEXT NOT NULL,           -- Absolute file path at capture time
    file_size   INTEGER NOT NULL,        -- Original uncompressed file size in bytes
    chunk_ids   TEXT NOT NULL,           -- JSON array of sha256 digests (ordered)
    mime_type   TEXT,                    -- e.g. "text/typescript", "image/png"
    created_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_snapshots_moment ON file_snapshots(moment_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_path   ON file_snapshots(file_path);
CREATE INDEX IF NOT EXISTS idx_snapshots_time   ON file_snapshots(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Clipboard History (enhanced — replaces v2 stub)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS clipboard_v3 (
    id              TEXT PRIMARY KEY,    -- UUID
    moment_id       TEXT REFERENCES moments(id) ON DELETE SET NULL,
    format          TEXT NOT NULL,       -- "text", "rtf", "html", "image"
    content_text    TEXT,                -- Plain text (NULL for image format)
    image_path      TEXT,                -- Path to .png for image format (NULL otherwise)
    entropy_score   REAL NOT NULL DEFAULT 0.0,
    is_redacted     INTEGER NOT NULL DEFAULT 0,  -- 1 = Ghost Shield redacted
    source_app      TEXT,                -- App name that wrote to clipboard
    source_window   TEXT,                -- Window title at time of clipboard write
    byte_size       INTEGER NOT NULL DEFAULT 0,
    created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_clipboard_v3_moment ON clipboard_v3(moment_id);
CREATE INDEX IF NOT EXISTS idx_clipboard_v3_time   ON clipboard_v3(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clipboard_v3_format ON clipboard_v3(format);

-- FTS5 index for clipboard text search
CREATE VIRTUAL TABLE IF NOT EXISTS clipboard_fts USING fts5 (
    entry_id   UNINDEXED,
    content_text,
    source_app,
    source_window,
    tokenize   = 'porter unicode61'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. OCR Bounding Boxes (per-word, per-moment)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ocr_boxes (
    id          TEXT PRIMARY KEY,        -- UUID
    moment_id   TEXT NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
    word        TEXT NOT NULL,           -- OCR-recognized word
    x           INTEGER NOT NULL,        -- Bounding box left (pixels, screen coords)
    y           INTEGER NOT NULL,        -- Bounding box top
    width       INTEGER NOT NULL,
    height      INTEGER NOT NULL,
    confidence  REAL NOT NULL DEFAULT 1.0,
    line_index  INTEGER NOT NULL DEFAULT 0,  -- Line number within the OCR result
    word_index  INTEGER NOT NULL DEFAULT 0   -- Word position within the line
);

CREATE INDEX IF NOT EXISTS idx_ocr_boxes_moment ON ocr_boxes(moment_id);
CREATE INDEX IF NOT EXISTS idx_ocr_boxes_word   ON ocr_boxes(word COLLATE NOCASE);

-- FTS5 over OCR words (links back to moment for fast full-text screenshot search)
CREATE VIRTUAL TABLE IF NOT EXISTS ocr_fts USING fts5 (
    moment_id  UNINDEXED,
    words,
    tokenize   = 'porter unicode61'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Watched Paths Registry
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS watched_paths (
    id          TEXT PRIMARY KEY,        -- UUID
    path        TEXT NOT NULL UNIQUE,    -- Absolute directory path being watched
    label       TEXT,                    -- Human-readable label (e.g. "My Project")
    is_active   INTEGER NOT NULL DEFAULT 1,
    added_at    INTEGER NOT NULL
);
