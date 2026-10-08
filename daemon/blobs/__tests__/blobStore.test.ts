/**
 * @file blobStore.test.ts
 * Tests for the CAS BlobStore (daemon/blobs/blobStore.ts)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { BlobStore } from '../blobStore.js';

describe('BlobStore', () => {
  let tmpDir: string;
  let store: BlobStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewind-blobs-test-'));
    store = new BlobStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores a blob and returns correct metadata', () => {
    const data = Buffer.from('hello rewind v3');
    const meta = store.put(data);

    expect(meta.sha256).toHaveLength(64);
    expect(meta.sizeBytes).toBe(data.length);
    expect(meta.zstdSize).toBeGreaterThan(0);
    expect(meta.createdAt).toBeGreaterThan(0);
  });

  it('deduplicates identical chunks (returns existing meta)', () => {
    const data = Buffer.from('deduplicated content');
    const meta1 = store.put(data);
    const meta2 = store.put(data);

    expect(meta1.sha256).toBe(meta2.sha256);
    // Only one file should exist
    const blobPath = store['_blobPath'](meta1.sha256);
    expect(fs.existsSync(blobPath)).toBe(true);
  });

  it('stores different chunks as different blobs', () => {
    const meta1 = store.put(Buffer.from('chunk A content'));
    const meta2 = store.put(Buffer.from('chunk B content'));

    expect(meta1.sha256).not.toBe(meta2.sha256);
    expect(store.has(meta1.sha256)).toBe(true);
    expect(store.has(meta2.sha256)).toBe(true);
  });

  it('retrieves a stored blob', () => {
    const original = Buffer.from('round-trip test data for REWIND');
    const meta = store.put(original);
    const retrieved = store.get(meta.sha256);

    expect(retrieved.equals(original)).toBe(true);
  });

  it('throws when getting a non-existent blob', () => {
    expect(() => store.get('a'.repeat(64))).toThrow('blob not found');
  });

  it('deletes a blob', () => {
    const data = Buffer.from('delete me');
    const meta = store.put(data);

    expect(store.has(meta.sha256)).toBe(true);
    const deleted = store.delete(meta.sha256);
    expect(deleted).toBe(true);
    expect(store.has(meta.sha256)).toBe(false);
  });

  it('returns false when deleting non-existent blob', () => {
    expect(store.delete('b'.repeat(64))).toBe(false);
  });

  it('reports accurate stats', () => {
    store.put(Buffer.from('stats test alpha'));
    store.put(Buffer.from('stats test beta'));

    const stats = store.stats();
    expect(stats.totalBlobs).toBe(2);
    expect(stats.totalBytes).toBeGreaterThan(0);
    expect(stats.blobDir).toBe(tmpDir);
  });

  it('uses 2-char prefix subdirectory for blob paths', () => {
    const data = Buffer.from('path structure test');
    const meta = store.put(data);
    const blobPath = store['_blobPath'](meta.sha256);

    const prefix = meta.sha256.slice(0, 2);
    expect(blobPath).toContain(path.join(tmpDir, prefix));
  });

  it('writes atomically (no .tmp file left behind)', () => {
    const data = Buffer.from('atomic write test');
    const meta = store.put(data);
    const tmpPath = `${store['_blobPath'](meta.sha256)}.tmp`;

    expect(fs.existsSync(tmpPath)).toBe(false);
  });

  it('uses custom compress/decompress functions', () => {
    const reversed = (b: Buffer) => Buffer.from([...b].reverse());
    const customStore = new BlobStore(tmpDir + '-custom', reversed, reversed);

    const data = Buffer.from('custom compression test data');
    const meta = customStore.put(data);
    const retrieved = customStore.get(meta.sha256);

    expect(retrieved.equals(data)).toBe(true);
    fs.rmSync(tmpDir + '-custom', { recursive: true, force: true });
  });
});
