/**
 * @file vectorStore.ts
 * @description Fast local vector index and SQLite embedding persistence for REWIND v4.0.
 *
 * Manages dense vectors in `moment_embeddings`.
 * Offers sub-millisecond top-K cosine similarity search across historical moments.
 */

import type Database from 'better-sqlite3';
import {
  cosineSimilarity,
  vectorToBuffer,
  bufferToVector,
} from './embeddings.js';

export interface MomentVector {
  momentId: string;
  vector: Float32Array;
  sourceText: string;
}

export interface VectorSearchResult {
  momentId: string;
  score: number;
  sourceText: string;
}

export class VectorStore {
  private readonly db: Database.Database;
  /** In-memory cache of vectors for microsecond top-K scans */
  private cache: MomentVector[] = [];
  private isCacheLoaded = false;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Save or update an embedding for a specific moment.
   */
  saveEmbedding(momentId: string, vector: Float32Array, sourceText: string): void {
    const blob = vectorToBuffer(vector);
    this.db.prepare(`
      INSERT OR REPLACE INTO moment_embeddings 
        (moment_id, embedding_blob, dimensions, source_text, model_version, created_at)
      VALUES 
        (?, ?, ?, ?, 'all-MiniLM-L6-v2', ?)
    `).run(momentId, blob, vector.length, sourceText, Date.now());

    // Update in-memory cache
    if (this.isCacheLoaded) {
      const existingIdx = this.cache.findIndex((item) => item.momentId === momentId);
      const entry: MomentVector = { momentId, vector, sourceText };
      if (existingIdx >= 0) {
        this.cache[existingIdx] = entry;
      } else {
        this.cache.push(entry);
      }
    }
  }

  /**
   * Warm up the in-memory cache from SQLite for fast repeated querying.
   */
  loadCache(): void {
    const rows = this.db.prepare(`
      SELECT moment_id, embedding_blob, source_text FROM moment_embeddings
    `).all() as { moment_id: string; embedding_blob: Buffer; source_text: string }[];

    this.cache = rows.map((r) => ({
      momentId: r.moment_id,
      vector: bufferToVector(r.embedding_blob),
      sourceText: r.source_text,
    }));
    this.isCacheLoaded = true;
  }

  /**
   * Perform Top-K nearest neighbor search using cosine similarity.
   */
  search(queryVector: Float32Array, topK = 10, minScore = 0.2): VectorSearchResult[] {
    if (!this.isCacheLoaded) {
      this.loadCache();
    }

    const results: VectorSearchResult[] = [];

    for (let i = 0; i < this.cache.length; i++) {
      const item = this.cache[i]!;
      const score = cosineSimilarity(queryVector, item.vector);
      if (score >= minScore) {
        results.push({
          momentId: item.momentId,
          score,
          sourceText: item.sourceText,
        });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /**
   * Get embedding for a specific moment if it exists.
   */
  getEmbedding(momentId: string): Float32Array | null {
    if (this.isCacheLoaded) {
      const found = this.cache.find((c) => c.momentId === momentId);
      if (found) return found.vector;
    }

    const row = this.db.prepare(`
      SELECT embedding_blob FROM moment_embeddings WHERE moment_id = ?
    `).get(momentId) as { embedding_blob: Buffer } | undefined;

    if (!row) return null;
    return bufferToVector(row.embedding_blob);
  }

  /**
   * Count total moments indexed with vectors.
   */
  count(): number {
    const row = this.db.prepare(`SELECT COUNT(*) as count FROM moment_embeddings`).get() as { count: number };
    return row.count;
  }
}
