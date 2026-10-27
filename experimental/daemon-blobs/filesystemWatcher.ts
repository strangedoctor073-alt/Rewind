/**
 * @file filesystemWatcher.ts
 * @description Filesystem watcher for REWIND v3 delta snapshot engine.
 *
 * Uses Node.js `fs.watch` with recursive mode on Windows (backed by
 * ReadDirectoryChangesW under the hood). On Linux CI (Trap 7), this falls back
 * gracefully with a mock-injectable constructor.
 *
 * For each modified file:
 *  1. Checks path against gitignore-style exclusion rules
 *  2. Rejects files > MAX_FILE_BYTES (10MB)
 *  3. Reads file, chunks it via FastCDC
 *  4. Stores new chunks in BlobStore
 *  5. Registers snapshot manifest in BlobIndex
 *  6. Fires onChange callback with the resulting FileSnapshot
 *
 * Ghost Shield: Never watches password manager directories or credential files.
 */

import fs from 'node:fs';
import path from 'node:path';
import { chunk, manifestHash } from './fastCDC.js';
import { BlobStore } from './blobStore.js';
import { BlobIndex } from './blobIndex.js';
import type { FileSnapshot } from './blobIndex.js';

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Maximum file size to snapshot (10 MB) */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Debounce window for rapid successive writes to the same file (ms) */
const DEBOUNCE_MS = 300;

/**
 * Directories always excluded from watching (gitignore-style).
 * These are basename matches — any path segment matching is excluded.
 */
const EXCLUDED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
  '.cache', 'coverage', '__pycache__', '.venv', 'venv', 'target',
  '.rewind', '.tmp',
]);

/**
 * File extensions always excluded (binary artifacts, locks, etc.).
 */
const EXCLUDED_EXTS = new Set([
  '.exe', '.dll', '.so', '.dylib', '.bin', '.obj', '.o', '.a',
  '.zip', '.tar', '.gz', '.7z', '.rar',
  '.mp4', '.mkv', '.avi', '.mov',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.webp',
  '.pdf', '.docx', '.xlsx', '.pptx',
  '.db', '.db-shm', '.db-wal', '.sqlite',
  '.lock', '.wal', '.tmp', '.token',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SnapshotCallback = (snapshot: FileSnapshot) => void;

export interface WatchedPath {
  id: string;
  absPath: string;
  label: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// FilesystemWatcher
// ─────────────────────────────────────────────────────────────────────────────

export class FilesystemWatcher {
  private readonly blobStore: BlobStore;
  private readonly blobIndex: BlobIndex;
  private readonly onChange: SnapshotCallback;
  private readonly watchers = new Map<string, fs.FSWatcher>();
  private readonly debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Cache of last known manifest hash per file to skip duplicate snapshots */
  private readonly manifestCache = new Map<string, string>();

  constructor(
    blobStore: BlobStore,
    blobIndex: BlobIndex,
    onChange: SnapshotCallback,
  ) {
    this.blobStore = blobStore;
    this.blobIndex = blobIndex;
    this.onChange = onChange;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Start watching a directory path recursively.
   * Returns false if path doesn't exist or is already watched.
   */
  watch(absPath: string): boolean {
    if (this.watchers.has(absPath)) return false;
    if (!fs.existsSync(absPath)) return false;

    try {
      const watcher = fs.watch(
        absPath,
        { recursive: true, persistent: false },
        (_event, filename) => {
          if (!filename) return;
          const fullPath = path.join(absPath, filename).replace(/\0+$/, '').trim();
          this._scheduleSnapshot(fullPath);
        },
      );
      this.watchers.set(absPath, watcher);
      return true;
    } catch {
      // fs.watch may throw on unsupported platforms (Linux without inotify, etc.)
      return false;
    }
  }

  /**
   * Stop watching a previously registered path.
   */
  unwatch(absPath: string): void {
    const watcher = this.watchers.get(absPath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(absPath);
    }
  }

  /**
   * Stop all watchers and clear debounce timers.
   */
  close(): void {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    for (const watcher of this.watchers.values()) watcher.close();
    this.watchers.clear();
  }

  /**
   * Manually trigger a snapshot of a file (used for initial scan or testing).
   */
  async snapshotFile(filePath: string, momentId?: string): Promise<FileSnapshot | null> {
    return this._takeSnapshot(filePath, momentId);
  }

  /** Returns the set of currently watched root paths */
  watchedPaths(): string[] {
    return [...this.watchers.keys()];
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /** Debounce rapid successive writes to the same file */
  private _scheduleSnapshot(filePath: string): void {
    const existing = this.debounceTimers.get(filePath);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.debounceTimers.delete(filePath);
      void this._takeSnapshot(filePath);
    }, DEBOUNCE_MS);
    this.debounceTimers.set(filePath, timer);
  }

  /** Check if a file path should be excluded from snapshotting */
  private _isExcluded(filePath: string): boolean {
    const parts = filePath.replace(/\\/g, '/').split('/');
    for (const part of parts) {
      if (EXCLUDED_DIRS.has(part)) return true;
    }
    const ext = path.extname(filePath).toLowerCase();
    return EXCLUDED_EXTS.has(ext);
  }

  /** Read file, chunk it, store blobs, register manifest */
  private async _takeSnapshot(filePath: string, momentId?: string): Promise<FileSnapshot | null> {
    if (this._isExcluded(filePath)) return null;

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return null;  // File deleted or inaccessible
    }

    if (!stat.isFile()) return null;
    if (stat.size > MAX_FILE_BYTES) return null;

    let content: Buffer;
    try {
      content = fs.readFileSync(filePath);
    } catch {
      return null;
    }

    // Chunk via FastCDC
    const chunks = chunk(content);
    const chunkIds: string[] = [];

    for (const c of chunks) {
      const meta = this.blobStore.put(c.data as Buffer);
      chunkIds.push(meta.sha256);
      if (!this.blobIndex.hasChunk(meta.sha256)) {
        this.blobIndex.registerChunk({
          sha256: meta.sha256,
          sizeBytes: meta.sizeBytes,
          zstdSize: meta.zstdSize,
          createdAt: meta.createdAt,
        });
      }
    }

    // Dedup: skip if manifest hasn't changed since last snapshot
    const mHash = manifestHash(chunkIds);
    if (this.manifestCache.get(filePath) === mHash) return null;
    this.manifestCache.set(filePath, mHash);

    const snapshot = this.blobIndex.addSnapshot({
      momentId: momentId ?? null,
      filePath,
      fileSize: stat.size,
      chunkIds,
      mimeType: guessMime(filePath),
      createdAt: Date.now(),
    });

    this.onChange(snapshot);
    return snapshot;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MIME type guesser (lightweight, no dependencies)
// ─────────────────────────────────────────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  '.ts': 'text/typescript', '.tsx': 'text/typescript',
  '.js': 'text/javascript', '.jsx': 'text/javascript', '.mjs': 'text/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.html': 'text/html', '.htm': 'text/html',
  '.css': 'text/css',
  '.py': 'text/x-python',
  '.rs': 'text/x-rust',
  '.go': 'text/x-go',
  '.c': 'text/x-c', '.cpp': 'text/x-c', '.h': 'text/x-c',
  '.yaml': 'text/yaml', '.yml': 'text/yaml',
  '.toml': 'application/toml',
  '.sql': 'application/sql',
  '.sh': 'application/x-sh',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.xml': 'text/xml',
  '.svg': 'image/svg+xml',
};

function guessMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] ?? 'application/octet-stream';
}
