/**
 * @file clipboardStore.test.ts
 * Tests for ClipboardStore (daemon/clipboard/clipboardStore.ts)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Database from 'better-sqlite3';
import { ClipboardStore } from '../clipboardStore.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test schema setup (inline minimal migration for clipboard_v3 + clipboard_fts)
// ─────────────────────────────────────────────────────────────────────────────

function setupDb(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS clipboard_v3 (
      id TEXT PRIMARY KEY,
      moment_id TEXT,
      format TEXT NOT NULL,
      content_text TEXT,
      image_path TEXT,
      entropy_score REAL NOT NULL DEFAULT 0.0,
      is_redacted INTEGER NOT NULL DEFAULT 0,
      source_app TEXT,
      source_window TEXT,
      byte_size INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS clipboard_fts USING fts5 (
      entry_id UNINDEXED,
      content_text,
      source_app,
      source_window,
      tokenize = 'porter unicode61'
    );
  `);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('ClipboardStore', () => {
  let tmpDir: string;
  let db: Database.Database;
  let store: ClipboardStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewind-clip-test-'));
    db = setupDb(path.join(tmpDir, 'test.db'));
    store = new ClipboardStore(db, path.join(tmpDir, 'images'));
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores plain text entry and returns it', () => {
    const entry = store.add({
      format: 'text',
      text: 'Hello clipboard world',
      sourceApp: 'Notepad',
      timestamp: Date.now(),
    });

    expect(entry.id).toBeTruthy();
    expect(entry.format).toBe('text');
    expect(entry.contentText).toBe('Hello clipboard world');
    expect(entry.isRedacted).toBe(false);
  });

  it('redacts GitHub token in text entry', () => {
    const token = 'ghp_' + 'A'.repeat(36);
    const entry = store.add({
      format: 'text',
      text: `Token: ${token}`,
      sourceApp: 'Terminal',
      timestamp: Date.now(),
    });

    expect(entry.isRedacted).toBe(true);
    expect(entry.contentText).toContain('[REDACTED]');
    expect(entry.contentText).not.toContain(token);
  });

  it('stores image entry and writes PNG file', () => {
    const fakeImage = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header bytes
    const entry = store.add({
      format: 'image',
      imageBytes: fakeImage,
      timestamp: Date.now(),
    });

    expect(entry.format).toBe('image');
    expect(entry.imagePath).toBeTruthy();
    expect(fs.existsSync(entry.imagePath!)).toBe(true);
    expect(entry.contentText).toBeNull();
  });

  it('getHistory returns entries newest-first', () => {
    const now = Date.now();
    store.add({ format: 'text', text: 'first', timestamp: now - 2000 });
    store.add({ format: 'text', text: 'second', timestamp: now - 1000 });
    store.add({ format: 'text', text: 'third', timestamp: now });

    const history = store.getHistory({ limit: 10 });
    expect(history).toHaveLength(3);
    expect(history[0]!.contentText).toBe('third');
    expect(history[2]!.contentText).toBe('first');
  });

  it('getHistory filters by format', () => {
    store.add({ format: 'text', text: 'text entry', timestamp: Date.now() });
    store.add({ format: 'image', imageBytes: Buffer.from([0]), timestamp: Date.now() });

    const textOnly = store.getHistory({ format: 'text' });
    expect(textOnly.every((e) => e.format === 'text')).toBe(true);
  });

  it('search finds matching entries via FTS', () => {
    store.add({ format: 'text', text: 'TypeScript interface definition', sourceApp: 'VS Code', timestamp: Date.now() });
    store.add({ format: 'text', text: 'totally unrelated content', sourceApp: 'Notepad', timestamp: Date.now() });

    const results = store.search('TypeScript');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.contentText).toContain('TypeScript');
  });

  it('getById returns correct entry', () => {
    const entry = store.add({ format: 'text', text: 'get by id test', timestamp: Date.now() });
    const found = store.getById(entry.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(entry.id);
  });

  it('getById returns null for unknown id', () => {
    expect(store.getById('nonexistent-uuid')).toBeNull();
  });

  it('records entropy score', () => {
    const entry = store.add({ format: 'text', text: 'hello world', timestamp: Date.now() });
    expect(entry.entropyScore).toBeGreaterThan(0);
  });
});
