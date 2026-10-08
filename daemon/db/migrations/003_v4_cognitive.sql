-- REWIND v4.0 Schema Migration: Cognitive Recall
-- Adds: moment_embeddings, standup_summaries, semantic_queries

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Moment Vector Embeddings
-- ─────────────────────────────────────────────────────────────────────────────

-- Stores 384-dimensional dense vectors (serialized Float32Array blob)
-- and metadata for fast cosine similarity scoring & hybrid search.
CREATE TABLE IF NOT EXISTS moment_embeddings (
    moment_id       TEXT PRIMARY KEY REFERENCES moments(id) ON DELETE CASCADE,
    embedding_blob  BLOB NOT NULL,           -- Float32Array (384 * 4 = 1536 bytes)
    dimensions      INTEGER NOT NULL DEFAULT 384,
    source_text     TEXT NOT NULL,           -- The concatenated text (title + app + OCR)
    model_version   TEXT NOT NULL DEFAULT 'all-MiniLM-L6-v2',
    created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_embeddings_model ON moment_embeddings(model_version);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Daily Standups & AI Summaries
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS standup_summaries (
    id              TEXT PRIMARY KEY,        -- UUID
    period_start    INTEGER NOT NULL,        -- Timestamp start
    period_end      INTEGER NOT NULL,        -- Timestamp end
    summary_type    TEXT NOT NULL,           -- 'daily_standup', 'timesheet', 'commit_draft'
    summary_markdown TEXT NOT NULL,          -- Markdown generated summary
    apps_involved   TEXT NOT NULL,           -- JSON array of top apps
    moment_count    INTEGER NOT NULL,        -- Total moments digested
    model_name      TEXT NOT NULL,           -- e.g. 'llama3:8b', 'mistral', 'fallback'
    created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_summaries_time ON standup_summaries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_summaries_type ON standup_summaries(summary_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Semantic Query Log / Cache
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS semantic_queries (
    id              TEXT PRIMARY KEY,
    query_text      TEXT NOT NULL UNIQUE,
    embedding_blob  BLOB NOT NULL,
    dimensions      INTEGER NOT NULL DEFAULT 384,
    last_used_at    INTEGER NOT NULL
);
