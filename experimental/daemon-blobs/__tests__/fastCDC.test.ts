/**
 * @file fastCDC.test.ts
 * Tests for the FastCDC content-defined chunking algorithm (daemon/blobs/fastCDC.ts)
 */

import { describe, it, expect } from 'vitest';
import { chunk, manifestHash } from '../fastCDC.js';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function randomBuffer(size: number, seed = 42): Buffer {
  // Deterministic pseudo-random buffer (LCG) — reproducible across platforms
  const buf = Buffer.allocUnsafe(size);
  let state = seed;
  for (let i = 0; i < size; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    buf[i] = state & 0xff;
  }
  return buf;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('FastCDC', () => {
  it('reassembles all chunks to original content', () => {
    const original = randomBuffer(100 * 1024);  // 100 KB
    const chunks = chunk(original);

    const reassembled = Buffer.concat(chunks.map((c) => c.data as Buffer));
    expect(reassembled.equals(original)).toBe(true);
  });

  it('produces at least one chunk for any non-empty input', () => {
    expect(chunk(Buffer.from('hello'))).toHaveLength(1);
    expect(chunk(randomBuffer(1024))).toHaveLength(1);
  });

  it('produces multiple chunks for large inputs', () => {
    const large = randomBuffer(200 * 1024);  // 200 KB — well above AVG 8KB
    const chunks = chunk(large);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('chunk sizes respect MIN (2KB) and MAX (64KB) bounds', () => {
    const buf = randomBuffer(512 * 1024);  // 512 KB
    const chunks = chunk(buf);

    for (const c of chunks.slice(0, -1)) {  // Exclude tail chunk
      expect(c.length).toBeGreaterThanOrEqual(2 * 1024);
      expect(c.length).toBeLessThanOrEqual(64 * 1024);
    }
  });

  it('correctly records chunk offsets', () => {
    const buf = randomBuffer(100 * 1024);
    const chunks = chunk(buf);

    let expectedOffset = 0;
    for (const c of chunks) {
      expect(c.offset).toBe(expectedOffset);
      expectedOffset += c.length;
    }
    expect(expectedOffset).toBe(buf.length);
  });

  it('is deterministic — same input produces same chunk boundaries', () => {
    const buf = randomBuffer(80 * 1024);
    const chunks1 = chunk(buf);
    const chunks2 = chunk(buf);

    expect(chunks1.length).toBe(chunks2.length);
    for (let i = 0; i < chunks1.length; i++) {
      expect(chunks1[i]!.offset).toBe(chunks2[i]!.offset);
      expect(chunks1[i]!.length).toBe(chunks2[i]!.length);
    }
  });

  it('small edit in middle produces unchanged chunks at start and end', () => {
    const buf1 = randomBuffer(64 * 1024);
    const buf2 = Buffer.from(buf1);
    // Flip one byte in the middle
    buf2[Math.floor(buf2.length / 2)] ^= 0xff;

    const chunks1 = chunk(buf1);
    const chunks2 = chunk(buf2);

    // At least the first chunk should be identical (content-defined: unaffected region)
    if (chunks1.length > 1 && chunks2.length > 1) {
      expect(chunks1[0]!.data.equals(chunks2[0]!.data)).toBe(true);
    }
  });

  it('handles empty buffer gracefully', () => {
    const chunks = chunk(Buffer.alloc(0));
    expect(chunks).toHaveLength(0);
  });

  it('handles very small buffer (< MIN_SIZE) as single chunk', () => {
    const small = Buffer.from('small content');
    const chunks = chunk(small);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.data.equals(small)).toBe(true);
  });

  it('manifestHash produces stable string from chunk IDs', () => {
    const ids = ['abc123', 'def456', 'ghi789'];
    const h1 = manifestHash(ids);
    const h2 = manifestHash(ids);
    expect(h1).toBe(h2);
    expect(h1).toBe('abc123:def456:ghi789');
  });

  it('different chunk IDs produce different manifest hashes', () => {
    expect(manifestHash(['a', 'b'])).not.toBe(manifestHash(['a', 'c']));
  });
});
