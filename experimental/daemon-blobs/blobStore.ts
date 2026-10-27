/**
 * @file blobStore.ts
 * @description Content-Addressable Storage (CAS) blob store for REWIND v3.
 *
 * Stores deduplicated file chunks under `~/.rewind/blobs/<2-char-prefix>/<sha256>`.
 * Each blob is written atomically (tmp → rename) to prevent corruption.
 * Blob files are raw Zstandard-compressed bytes.
 *
 * Ghost Shield: This module never processes clipboard or screenshot data directly —
 * it only handles file content chunks routed from the FilesystemWatcher.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface BlobMeta {
  sha256: string;
  sizeBytes: number;       // Uncompressed
  zstdSize: number;        // Compressed on-disk size
  createdAt: number;       // Unix epoch ms
}

export interface BlobStoreStats {
  totalBlobs: number;
  totalBytes: number;      // Sum of zstdSize (on-disk)
  blobDir: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// BlobStore
// ─────────────────────────────────────────────────────────────────────────────

export class BlobStore {
  private readonly blobDir: string;
  private readonly compress: (buf: Buffer) => Buffer;
  private readonly decompress: (buf: Buffer) => Buffer;

  /**
   * @param blobDir  Root directory for blob storage (default: ~/.rewind/blobs)
   * @param compress  Compression function (defaults to identity for CI/Linux compat)
   * @param decompress Decompression function
   */
  constructor(
    blobDir?: string,
    compress?: (buf: Buffer) => Buffer,
    decompress?: (buf: Buffer) => Buffer,
  ) {
    this.blobDir = blobDir ?? path.join(os.homedir(), '.rewind', 'blobs');
    // Default: identity (no-op) so tests and Linux CI work without native zstd.
    // Production: swap in real Zstandard via compressor.ts.
    this.compress = compress ?? ((b) => b);
    this.decompress = decompress ?? ((b) => b);
    fs.mkdirSync(this.blobDir, { recursive: true });
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Store a raw chunk buffer. Returns the SHA-256 hex digest.
   * If the blob already exists (dedup hit), skips the write and returns immediately.
   *
   * @param chunk  Uncompressed raw bytes of the content chunk
   * @returns  BlobMeta for the stored (or already-existing) blob
   */
  put(chunk: Buffer): BlobMeta {
    const sha256 = this._sha256(chunk);
    const blobPath = this._blobPath(sha256);

    if (fs.existsSync(blobPath)) {
      // Deduplication hit — blob already stored
      const stat = fs.statSync(blobPath);
      return {
        sha256,
        sizeBytes: chunk.length,
        zstdSize: stat.size,
        createdAt: stat.ctimeMs,
      };
    }

    const compressed = this.compress(chunk);

    // Atomic write: tmp file → rename (Trap 6 compliance)
    const tmpPath = `${blobPath}.tmp`;
    const dir = path.dirname(blobPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmpPath, compressed);
    fs.renameSync(tmpPath, blobPath);

    return {
      sha256,
      sizeBytes: chunk.length,
      zstdSize: compressed.length,
      createdAt: Date.now(),
    };
  }

  /**
   * Retrieve and decompress a blob by SHA-256 digest.
   * @throws  If blob does not exist
   */
  get(sha256: string): Buffer {
    const blobPath = this._blobPath(sha256);
    if (!fs.existsSync(blobPath)) {
      throw new Error(`BlobStore: blob not found: ${sha256}`);
    }
    const compressed = fs.readFileSync(blobPath);
    return this.decompress(compressed);
  }

  /**
   * Check if a blob exists without reading it.
   */
  has(sha256: string): boolean {
    return fs.existsSync(this._blobPath(sha256));
  }

  /**
   * Delete a blob by SHA-256 digest. Used during pruning/GC.
   * Returns true if deleted, false if it didn't exist.
   */
  delete(sha256: string): boolean {
    const blobPath = this._blobPath(sha256);
    if (!fs.existsSync(blobPath)) return false;
    fs.rmSync(blobPath);
    return true;
  }

  /**
   * Compute aggregate stats for the blob store.
   */
  stats(): BlobStoreStats {
    let totalBlobs = 0;
    let totalBytes = 0;

    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name));
        } else {
          totalBlobs++;
          totalBytes += fs.statSync(path.join(dir, entry.name)).size;
        }
      }
    };

    walk(this.blobDir);
    return { totalBlobs, totalBytes, blobDir: this.blobDir };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** Compute SHA-256 hex digest of a buffer. */
  _sha256(buf: Buffer): string {
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  /**
   * Path for a blob: <blobDir>/<2-char prefix>/<full-sha256>
   * The 2-char subdirectory prefix prevents filesystem inode exhaustion on
   * directories with millions of blobs (same pattern as git objects/).
   */
  _blobPath(sha256: string): string {
    return path.join(this.blobDir, sha256.slice(0, 2), sha256);
  }
}
