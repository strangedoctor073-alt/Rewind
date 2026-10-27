/**
 * @file boundingBoxStore.ts
 * @description OCR bounding box persistence for REWIND v3 click-to-copy.
 *
 * Stores per-word bounding box coordinates for each captured screenshot moment.
 * The Grand Dashboard renders these as invisible clickable hit-regions overlaid
 * on snapshot thumbnails — users click any word/error/URL in a historical
 * screenshot to copy it to clipboard instantly.
 */

import crypto from 'node:crypto';
import type Database from 'better-sqlite3';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface OcrBox {
  id: string;
  momentId: string;
  word: string;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  lineIndex: number;
  wordIndex: number;
}

export interface OcrLine {
  lineIndex: number;
  words: OcrBox[];
  /** Reconstructed line text */
  text: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// BoundingBoxStore
// ─────────────────────────────────────────────────────────────────────────────

export class BoundingBoxStore {
  private readonly db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Persist a batch of OCR word boxes for a given moment.
   * Runs as a single transaction for performance.
   * Also updates the ocr_fts index with the full reconstructed text.
   *
   * @param momentId  The timeline moment these boxes belong to
   * @param boxes     Array of word boxes from the OCR engine (without id/momentId)
   */
  addBoxes(momentId: string, boxes: Omit<OcrBox, 'id' | 'momentId'>[]): OcrBox[] {
    if (boxes.length === 0) return [];

    const stored: OcrBox[] = [];

    const insert = this.db.prepare(`
      INSERT INTO ocr_boxes (id, moment_id, word, x, y, width, height, confidence, line_index, word_index)
      VALUES (@id, @momentId, @word, @x, @y, @width, @height, @confidence, @lineIndex, @wordIndex)
    `);

    const insertMany = this.db.transaction((items: OcrBox[]) => {
      for (const item of items) insert.run(item);
    });

    const fullBoxes = boxes.map((b) => ({ id: crypto.randomUUID(), momentId, ...b }));
    insertMany(fullBoxes);
    stored.push(...fullBoxes);

    // Update FTS index with full reconstructed text for this moment
    const words = boxes
      .sort((a, b) => a.lineIndex - b.lineIndex || a.wordIndex - b.wordIndex)
      .map((b) => b.word)
      .join(' ');

    this.db.prepare(`
      INSERT OR REPLACE INTO ocr_fts (moment_id, words) VALUES (?, ?)
    `).run(momentId, words);

    return stored;
  }

  /**
   * Get all bounding boxes for a moment, sorted by line then word position.
   */
  getBoxes(momentId: string): OcrBox[] {
    const rows = this.db.prepare(`
      SELECT * FROM ocr_boxes
      WHERE moment_id = ?
      ORDER BY line_index ASC, word_index ASC
    `).all(momentId) as Record<string, unknown>[];
    return rows.map(this._rowToBox);
  }

  /**
   * Get boxes for a moment organized by line for easy rendering.
   */
  getLines(momentId: string): OcrLine[] {
    const boxes = this.getBoxes(momentId);
    const lineMap = new Map<number, OcrBox[]>();
    for (const box of boxes) {
      const arr = lineMap.get(box.lineIndex) ?? [];
      arr.push(box);
      lineMap.set(box.lineIndex, arr);
    }
    return [...lineMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([lineIndex, words]) => ({
        lineIndex,
        words,
        text: words.map((w) => w.word).join(' '),
      }));
  }

  /**
   * Full-text search across all OCR-indexed moments.
   * Returns momentIds that match the query.
   */
  searchMoments(query: string, limit = 20): string[] {
    const rows = this.db.prepare(`
      SELECT moment_id FROM ocr_fts WHERE ocr_fts MATCH ? ORDER BY rank LIMIT ?
    `).all(query, limit) as { moment_id: string }[];
    return rows.map((r) => r.moment_id);
  }

  /**
   * Delete all boxes for a moment (called when a moment is purged).
   */
  deleteBoxes(momentId: string): void {
    this.db.prepare('DELETE FROM ocr_boxes WHERE moment_id = ?').run(momentId);
    this.db.prepare('DELETE FROM ocr_fts WHERE moment_id = ?').run(momentId);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private _rowToBox(row: Record<string, unknown>): OcrBox {
    return {
      id:         row['id'] as string,
      momentId:   row['moment_id'] as string,
      word:       row['word'] as string,
      x:          row['x'] as number,
      y:          row['y'] as number,
      width:      row['width'] as number,
      height:     row['height'] as number,
      confidence: row['confidence'] as number,
      lineIndex:  row['line_index'] as number,
      wordIndex:  row['word_index'] as number,
    };
  }
}
