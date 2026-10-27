/**
 * @file fastCDC.ts
 * @description FastCDC content-defined chunking for REWIND v3 blob deduplication.
 *
 * FastCDC finds natural chunk boundaries in file content using a Gear hash (fast
 * rolling hash). This means edits to a file produce only the changed chunks as
 * new blobs — unchanged regions before/after the edit are reused from the store.
 *
 * Reference: "FastCDC: a Fast and Efficient Content-Defined Chunking Approach"
 * (Wen Xia et al., USENIX ATC 2016)
 *
 * Configuration:
 *   - MIN chunk: 2KB
 *   - AVG chunk: 8KB  (mask bits = 13)
 *   - MAX chunk: 64KB
 */

// ─────────────────────────────────────────────────────────────────────────────
// Gear hash table (256-entry pseudo-random lookup for byte values)
// Generated once at module load — deterministic for a fixed seed.
// ─────────────────────────────────────────────────────────────────────────────

const GEAR: Uint32Array = (() => {
  const table = new Uint32Array(256);
  // Deterministic LCG-seeded PRNG for reproducibility across runs/platforms.
  let state = 0x12345678;
  for (let i = 0; i < 256; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    table[i] = state;
  }
  return table;
})();

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const MIN_SIZE  = 2  * 1024;   // 2 KB  — never cut below this
const AVG_SIZE  = 8  * 1024;   // 8 KB  — target average chunk size
const MAX_SIZE  = 64 * 1024;   // 64 KB — hard cap

// Masks for the two-level probability approach (FastCDC optimization):
//   Normal mask (13 bits) used up to 2× AVG_SIZE, then relaxed mask (12 bits).
const MASK_NORMAL  = (1 << 13) - 1;  // 0x1FFF  → targets ~8KB
const MASK_RELAXED = (1 << 12) - 1;  // 0x0FFF  → targets ~4KB (after 2×AVG)

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface Chunk {
  offset: number;   // Byte offset in the source buffer
  length: number;   // Byte length of this chunk
  data: Buffer;     // Slice of the source buffer (zero-copy view)
}

/**
 * Split a file buffer into content-defined chunks using FastCDC.
 *
 * @param buf  Complete file content as a Buffer
 * @returns    Array of chunks (min 2KB, avg 8KB, max 64KB)
 */
export function chunk(buf: Buffer): Chunk[] {
  const chunks: Chunk[] = [];
  let offset = 0;

  while (offset < buf.length) {
    const remaining = buf.length - offset;

    if (remaining <= MIN_SIZE) {
      // Tail too small — emit as-is
      chunks.push({ offset, length: remaining, data: buf.subarray(offset) });
      break;
    }

    const boundary = findBoundary(buf, offset);
    const length = boundary - offset;
    chunks.push({ offset, length, data: buf.subarray(offset, boundary) });
    offset = boundary;
  }

  return chunks;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal rolling hash boundary finder
// ─────────────────────────────────────────────────────────────────────────────

function findBoundary(buf: Buffer, start: number): number {
  const end = Math.min(start + MAX_SIZE, buf.length);
  let fp = 0;   // Fingerprint accumulator (32-bit rolling hash)

  // Skip the minimum prefix — never cut before MIN_SIZE bytes
  const minEnd = start + MIN_SIZE;

  for (let i = start; i < end; i++) {
    fp = ((fp << 1) >>> 0) ^ GEAR[buf[i]!];

    if (i < minEnd) continue;

    // Two-level mask: use tighter mask for normal zone, relax after 2×AVG
    const mask = i < start + AVG_SIZE * 2 ? MASK_NORMAL : MASK_RELAXED;

    if ((fp & mask) === 0) {
      return i + 1;  // Found natural boundary
    }
  }

  // Reached MAX_SIZE — force a cut
  return end;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: compute a simple hash for a chunk list (for manifest comparison)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute a stable fingerprint of a chunk list by concatenating their sha256 IDs.
 * Used to detect if a file's content has changed between snapshots without re-reading blobs.
 */
export function manifestHash(chunkSha256s: string[]): string {
  return chunkSha256s.join(':');
}
