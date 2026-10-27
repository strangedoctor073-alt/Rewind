/**
 * @file blobIndex.ts
 * @description SQLite manifest index for REWIND v3 file blob snapshots.
 *
 * Tracks which chunks (by sha256) make up each file snapshot, linking
 * them to a timeline moment. Enables O(1) lookup: "what did file X look
 * like at moment Y?" and time-travel restoration.
 *
 * Works in conjunction with BlobStore (which holds the actual bytes) and
 * FilesystemWatcher (which triggers new snapshots on file changes).
 */

import crypto from 'node:crypto';
import type Database from 'better-sqlite3';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface FileSnapshot {
  id: string;
  momentId: string | null;
  filePath: string;
  fileSize: number;
  chunkIds: string[];      // Ordered list of sha256 digests
  mimeType: string | null;
  createdAt: number;
}

export interface BlobChunkRecord {
  sha256: string;
  sizeBytes: number;
  zstdSize: number;
  createdAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// BlobIndex
// ─────────────────────────────────────────────────────────────────────────────

export class BlobIndex {
  private readonly db: Database.Database;

  /** @param db  An open better-sqlite3 database instance (WAL mode recommended) */
  constructor(db: Database.Database) {
    this.db = db;
  }

  // ── Chunk records ─────────────────────────────────────────────────────────

  /**
   * Register a blob chunk in the DB metadata table.
   * If the sha256 already exists, this is a no-op (idempotent).
   */
  registerChunk(rec: BlobChunkRecord): void {
    this.db.prepare(`
      INSERT OR IGNORE INTO blob_chunks (sha256, size_bytes, zstd_size, created_at)
      VALUES (@sha256, @sizeBytes, @zstdSize, @createdAt)
    `).run(rec);
  }

  /**
   * Check if a chunk is already tracked (dedup check before calling BlobStore.put).
   */
  hasChunk(sha256: string): boolean {
    const row = this.db.prepare(
      'SELECT 1 FROM blob_chunks WHERE sha256 = ?'
    ).get(sha256) as undefined | { 1: number };
    return row !== undefined;
  }

  // ── File snapshots ────────────────────────────────────────────────────────

  /**
   * Record a new file snapshot (set of chunk IDs for a file at a point in time).
   */
  addSnapshot(snap: Omit<FileSnapshot, 'id'>): FileSnapshot {
    const id = crypto.randomUUID();
    this.db.prepare(`
      INSERT INTO file_snapshots (id, moment_id, file_path, file_size, chunk_ids, mime_type, created_at)
      VALUES (@id, @momentId, @filePath, @fileSize, @chunkIds, @mimeType, @createdAt)
    `).run({
      id,
      momentId: snap.momentId ?? null,
      filePath: snap.filePath,
      fileSize: snap.fileSize,
      chunkIds: JSON.stringify(snap.chunkIds),
      mimeType: snap.mimeType ?? null,
      createdAt: snap.createdAt,
    });
    return { id, ...snap };
  }

  /**
   * Get the most recent snapshot for a given file path.
   */
  getLatestSnapshot(filePath: string): FileSnapshot | null {
    const row = this.db.prepare(`
      SELECT * FROM file_snapshots
      WHERE file_path = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(filePath) as Record<string, unknown> | undefined;
    return row ? this._rowToSnapshot(row) : null;
  }

  /**
   * Get all snapshots for a file, ordered newest-first.
   */
  getSnapshotHistory(filePath: string, limit = 50): FileSnapshot[] {
    const rows = this.db.prepare(`
      SELECT * FROM file_snapshots
      WHERE file_path = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(filePath, limit) as Record<string, unknown>[];
    return rows.map((r) => this._rowToSnapshot(r));
  }

  /**
   * Get all file snapshots linked to a specific timeline moment.
   */
  getSnapshotsForMoment(momentId: string): FileSnapshot[] {
    const rows = this.db.prepare(`
      SELECT * FROM file_snapshots WHERE moment_id = ? ORDER BY created_at ASC
    `).all(momentId) as Record<string, unknown>[];
    return rows.map((r) => this._rowToSnapshot(r));
  }

  /**
   * Get a snapshot by its unique ID.
   */
  getSnapshot(id: string): FileSnapshot | null {
    const row = this.db.prepare(
      'SELECT * FROM file_snapshots WHERE id = ?'
    ).get(id) as Record<string, unknown> | undefined;
    return row ? this._rowToSnapshot(row) : null;
  }

  /**
   * List all unique file paths that have been snapshotted.
   */
  listTrackedFiles(): string[] {
    const rows = this.db.prepare(
      'SELECT DISTINCT file_path FROM file_snapshots ORDER BY file_path'
    ).all() as { file_path: string }[];
    return rows.map((r) => r.file_path);
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _rowToSnapshot(row: Record<string, unknown>): FileSnapshot {
    return {
      id:        row['id'] as string,
      momentId:  row['moment_id'] as string | null,
      filePath:  row['file_path'] as string,
      fileSize:  row['file_size'] as number,
      chunkIds:  JSON.parse(row['chunk_ids'] as string) as string[],
      mimeType:  row['mime_type'] as string | null,
      createdAt: row['created_at'] as number,
    };
  }
}
