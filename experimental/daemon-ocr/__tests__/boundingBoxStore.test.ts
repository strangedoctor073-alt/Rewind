/**
 * @file boundingBoxStore.test.ts
 * Tests for the OCR BoundingBoxStore (daemon/ocr/boundingBoxStore.ts)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { BoundingBoxStore } from '../boundingBoxStore.js';

function setupDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS ocr_boxes (
      id TEXT PRIMARY KEY,
      moment_id TEXT NOT NULL,
      word TEXT NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      confidence REAL NOT NULL DEFAULT 1.0,
      line_index INTEGER NOT NULL DEFAULT 0,
      word_index INTEGER NOT NULL DEFAULT 0
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS ocr_fts USING fts5 (
      moment_id UNINDEXED,
      words,
      tokenize = 'porter unicode61'
    );
  `);
  return db;
}

describe('BoundingBoxStore', () => {
  let tmpDir: string;
  let db: Database.Database;
  let store: BoundingBoxStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewind-ocr-test-'));
    db = setupDb(path.join(tmpDir, 'test.db'));
    store = new BoundingBoxStore(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const sampleBoxes = [
    { word: 'Hello', x: 10, y: 20, width: 50, height: 20, confidence: 0.99, lineIndex: 0, wordIndex: 0 },
    { word: 'World', x: 65, y: 20, width: 55, height: 20, confidence: 0.97, lineIndex: 0, wordIndex: 1 },
    { word: 'REWIND', x: 10, y: 50, width: 80, height: 22, confidence: 0.95, lineIndex: 1, wordIndex: 0 },
  ];

  it('stores boxes and returns them with generated IDs', () => {
    const stored = store.addBoxes('moment-001', sampleBoxes);
    expect(stored).toHaveLength(3);
    for (const box of stored) {
      expect(box.id).toBeTruthy();
      expect(box.momentId).toBe('moment-001');
    }
  });

  it('getBoxes returns boxes sorted by line then word index', () => {
    store.addBoxes('moment-002', sampleBoxes);
    const boxes = store.getBoxes('moment-002');

    expect(boxes).toHaveLength(3);
    expect(boxes[0]!.word).toBe('Hello');
    expect(boxes[1]!.word).toBe('World');
    expect(boxes[2]!.word).toBe('REWIND');
  });

  it('getLines organizes boxes into line groups', () => {
    store.addBoxes('moment-003', sampleBoxes);
    const lines = store.getLines('moment-003');

    expect(lines).toHaveLength(2);
    expect(lines[0]!.text).toBe('Hello World');
    expect(lines[1]!.text).toBe('REWIND');
  });

  it('searchMoments finds moments by OCR word', () => {
    store.addBoxes('moment-search-1', sampleBoxes);
    store.addBoxes('moment-search-2', [
      { word: 'TypeScript', x: 0, y: 0, width: 100, height: 20, confidence: 1, lineIndex: 0, wordIndex: 0 },
    ]);

    const results = store.searchMoments('REWIND');
    expect(results).toContain('moment-search-1');
    expect(results).not.toContain('moment-search-2');
  });

  it('deleteBoxes removes all boxes and FTS entries for a moment', () => {
    store.addBoxes('moment-del', sampleBoxes);
    store.deleteBoxes('moment-del');

    const boxes = store.getBoxes('moment-del');
    expect(boxes).toHaveLength(0);

    const fts = store.searchMoments('Hello');
    expect(fts).not.toContain('moment-del');
  });

  it('returns empty array for moment with no boxes', () => {
    expect(store.getBoxes('nonexistent')).toHaveLength(0);
    expect(store.getLines('nonexistent')).toHaveLength(0);
  });

  it('handles addBoxes with empty array gracefully', () => {
    const result = store.addBoxes('moment-empty', []);
    expect(result).toHaveLength(0);
  });

  it('preserves bounding box coordinates exactly', () => {
    store.addBoxes('moment-coords', [
      { word: 'Precise', x: 123, y: 456, width: 789, height: 24, confidence: 0.88, lineIndex: 0, wordIndex: 0 },
    ]);
    const boxes = store.getBoxes('moment-coords');

    expect(boxes[0]!.x).toBe(123);
    expect(boxes[0]!.y).toBe(456);
    expect(boxes[0]!.width).toBe(789);
    expect(boxes[0]!.height).toBe(24);
    expect(boxes[0]!.confidence).toBeCloseTo(0.88);
  });
});
