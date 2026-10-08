/**
 * @file clipboardStore.ts
 * @description Multi-format clipboard history persistence for REWIND v3.
 *
 * Listens for new clipboard entries (provided by ClipboardWatcher), runs
 * them through the Ghost Shield EntropyScanner, then persists sanitized
 * copies to the SQLite `clipboard_v3` table and the `clipboard_fts` index.
 *
 * Supported formats: "text", "html", "rtf", "image"
 * Images are stored as PNG files in ~/.rewind/clipboard-images/.
 *
 * Privacy invariants (Trap 5):
 *   - High-entropy secrets are ALWAYS redacted before storage.
 *   - Image data is stored as-is (no OCR of clipboard images in v3; OCR is
 *     only run on screen captures).
 *   - is_redacted flag is set in DB for any entry that was modified by the scanner.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { scan } from './entropyScanner.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type ClipboardFormat = 'text' | 'html' | 'rtf' | 'image';

export interface RawClipboardEntry {
  format: ClipboardFormat;
  /** Plain text content (for text/html/rtf) */
  text?: string;
  /** Raw image bytes (PNG) for format === 'image' */
  imageBytes?: Buffer;
  sourceApp?: string;
  sourceWindow?: string;
  momentId?: string;
  timestamp: number;
}

export interface ClipboardEntry {
  id: string;
  momentId: string | null;
  format: ClipboardFormat;
  contentText: string | null;
  imagePath: string | null;
  entropyScore: number;
  isRedacted: boolean;
  sourceApp: string | null;
  sourceWindow: string | null;
  byteSize: number;
  createdAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ClipboardStore
// ─────────────────────────────────────────────────────────────────────────────

export class ClipboardStore {
  private readonly db: Database.Database;
  private readonly imageDir: string;

  constructor(db: Database.Database, imageDir?: string) {
    this.db = db;
    this.imageDir = imageDir ?? path.join(os.homedir(), '.rewind', 'clipboard-images');
    fs.mkdirSync(this.imageDir, { recursive: true });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Ingest a raw clipboard entry.
   * Runs Ghost Shield scanner on text content, then persists to DB.
   * Returns the stored ClipboardEntry.
   */
  add(raw: RawClipboardEntry): ClipboardEntry {
    const id = crypto.randomUUID();
    let contentText: string | null = null;
    let imagePath: string | null = null;
    let entropyScore = 0;
    let isRedacted = false;
    let byteSize = 0;

    if (raw.format === 'image' && raw.imageBytes) {
      // Store image as PNG file (atomic write)
      const filename = `${id}.png`;
      const fullPath = path.join(this.imageDir, filename);
      const tmpPath = `${fullPath}.tmp`;
      fs.writeFileSync(tmpPath, raw.imageBytes);
      fs.renameSync(tmpPath, fullPath);  // Atomic (Trap 6 compliance)
      imagePath = fullPath;
      byteSize = raw.imageBytes.length;
    } else if (raw.text != null) {
      // Run Ghost Shield entropy scanner on text
      const result = scan(raw.text);
      contentText = result.isSecret ? result.redacted : raw.text;
      entropyScore = result.entropyScore;
      isRedacted = result.isSecret;
      byteSize = Buffer.byteLength(contentText, 'utf8');

      // Index in FTS (only if not fully redacted)
      if (!isRedacted || contentText !== '[REDACTED]') {
        this.db.prepare(`
          INSERT INTO clipboard_fts (entry_id, content_text, source_app, source_window)
          VALUES (?, ?, ?, ?)
        `).run(id, contentText, raw.sourceApp ?? '', raw.sourceWindow ?? '');
      }
    }

    // Persist to clipboard_v3 table
    this.db.prepare(`
      INSERT INTO clipboard_v3
        (id, moment_id, format, content_text, image_path, entropy_score,
         is_redacted, source_app, source_window, byte_size, created_at)
      VALUES
        (@id, @momentId, @format, @contentText, @imagePath, @entropyScore,
         @isRedacted, @sourceApp, @sourceWindow, @byteSize, @createdAt)
    `).run({
      id,
      momentId: raw.momentId ?? null,
      format: raw.format,
      contentText,
      imagePath,
      entropyScore,
      isRedacted: isRedacted ? 1 : 0,
      sourceApp: raw.sourceApp ?? null,
      sourceWindow: raw.sourceWindow ?? null,
      byteSize,
      createdAt: raw.timestamp,
    });

    return {
      id,
      momentId: raw.momentId ?? null,
      format: raw.format,
      contentText,
      imagePath,
      entropyScore,
      isRedacted,
      sourceApp: raw.sourceApp ?? null,
      sourceWindow: raw.sourceWindow ?? null,
      byteSize,
      createdAt: raw.timestamp,
    };
  }

  /**
   * Get paginated clipboard history, newest first.
   */
  getHistory(opts: { limit?: number; offset?: number; format?: ClipboardFormat } = {}): ClipboardEntry[] {
    const { limit = 50, offset = 0, format } = opts;
    const rows = format
      ? this.db.prepare(
          'SELECT * FROM clipboard_v3 WHERE format = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
        ).all(format, limit, offset)
      : this.db.prepare(
          'SELECT * FROM clipboard_v3 ORDER BY created_at DESC LIMIT ? OFFSET ?'
        ).all(limit, offset);
    return (rows as Record<string, unknown>[]).map(this._rowToEntry);
  }

  /**
   * Full-text search clipboard history.
   */
  search(query: string, limit = 20): ClipboardEntry[] {
    const rows = this.db.prepare(`
      SELECT c.* FROM clipboard_v3 c
      JOIN clipboard_fts f ON f.entry_id = c.id
      WHERE clipboard_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as Record<string, unknown>[];
    return rows.map(this._rowToEntry);
  }

  /**
   * Get a single clipboard entry by ID.
   */
  getById(id: string): ClipboardEntry | null {
    const row = this.db.prepare('SELECT * FROM clipboard_v3 WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this._rowToEntry(row) : null;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _rowToEntry(row: Record<string, unknown>): ClipboardEntry {
    return {
      id:           row['id'] as string,
      momentId:     row['moment_id'] as string | null,
      format:       row['format'] as ClipboardFormat,
      contentText:  row['content_text'] as string | null,
      imagePath:    row['image_path'] as string | null,
      entropyScore: row['entropy_score'] as number,
      isRedacted:   (row['is_redacted'] as number) === 1,
      sourceApp:    row['source_app'] as string | null,
      sourceWindow: row['source_window'] as string | null,
      byteSize:     row['byte_size'] as number,
      createdAt:    row['created_at'] as number,
    };
  }
}
