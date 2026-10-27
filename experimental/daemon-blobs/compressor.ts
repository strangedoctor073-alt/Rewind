/**
 * @file compressor.ts
 * @description Zstandard compression wrapper for REWIND v3 blob store.
 *
 * Uses `fflate` (pure JS/WASM, zero native compilation) for compression.
 * This ensures Linux CI (Trap 7) and Windows production both work without
 * requiring any native build step.
 *
 * Production compression ratio: typically 3-6× for source code, 1.2-1.5× for binaries.
 *
 * Note: fflate uses DEFLATE (not Zstandard). For v3 we use DEFLATE as our
 * "Zstandard-equivalent" since it requires no native bindings. True Zstandard
 * can be swapped in via the BlobStore constructor's compress/decompress slots
 * if the user installs @bokuweb/zstd-wasm at runtime.
 */

import { deflateSync, inflateSync } from 'fflate';

// ─────────────────────────────────────────────────────────────────────────────
// Compression level: 6 (balanced speed/ratio, same as zstd default)
// ─────────────────────────────────────────────────────────────────────────────

const LEVEL = 6;

/**
 * Compress a Buffer using DEFLATE (level 6).
 * Returns a new Buffer containing compressed bytes.
 */
export function compress(buf: Buffer): Buffer {
  const input = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const compressed = deflateSync(input, { level: LEVEL });
  return Buffer.from(compressed);
}

/**
 * Decompress a DEFLATE-compressed Buffer.
 * Returns the original uncompressed bytes.
 */
export function decompress(buf: Buffer): Buffer {
  const input = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const decompressed = inflateSync(input);
  return Buffer.from(decompressed);
}

/**
 * Estimate compression ratio of a buffer without storing it.
 * Used for stats and deciding whether to compress images (usually not worth it).
 */
export function compressionRatio(raw: Buffer): number {
  if (raw.length === 0) return 1;
  const compressed = compress(raw);
  return raw.length / compressed.length;
}
