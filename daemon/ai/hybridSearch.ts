/**
 * @file hybridSearch.ts
 * @description Hybrid BM25 (FTS5) + Dense Vector Semantic Search for REWIND v4.0.
 *
 * Implements Reciprocal Rank Fusion (RRF):
 *   RRF_Score(d) = (w_fts / (k + rank_fts(d))) + (w_vec / (k + rank_vec(d)))
 *
 * This provides the best of both worlds:
 *  - Exact lexical keyword recall (error codes, hashes, URLs)
 *  - Conceptual semantic queries ("find the invoice I looked at on Tuesday")
 */

import type Database from 'better-sqlite3';
import { IEmbeddingEngine } from './embeddings.js';
import { VectorStore } from './vectorStore.js';

export interface HybridSearchResult {
  momentId: string;
  combinedScore: number;
  ftsRank: number | null;
  vectorRank: number | null;
  vectorScore: number | null;
  appName: string;
  windowTitle: string;
}

export class HybridSearchEngine {
  private readonly db: Database.Database;
  private readonly vectorStore: VectorStore;
  private readonly embeddingEngine: IEmbeddingEngine;

  constructor(
    db: Database.Database,
    vectorStore: VectorStore,
    embeddingEngine: IEmbeddingEngine
  ) {
    this.db = db;
    this.vectorStore = vectorStore;
    this.embeddingEngine = embeddingEngine;
  }

  /**
   * Search timeline using both lexical FTS5 and dense semantic vectors.
   *
   * @param query Plain text query string
   * @param limit Max results to return
   * @param rrfK Parameter k for Reciprocal Rank Fusion (default 60)
   */
  async search(query: string, limit = 20, rrfK = 60): Promise<HybridSearchResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    // 1. Lexical search via FTS5
    let ftsRows: { moment_id: string }[];
    try {
      ftsRows = this.db.prepare(`
        SELECT moment_id FROM timeline_fts 
        WHERE timeline_fts MATCH ? 
        ORDER BY rank 
        LIMIT ?
      `).all(trimmed, limit * 2) as { moment_id: string }[];
    } catch {
      // If FTS fails (e.g. invalid query syntax), fall back gracefully
      ftsRows = [];
    }

    // 2. Dense Vector semantic search
    const queryVector = await this.embeddingEngine.embed(trimmed);
    const vectorMatches = this.vectorStore.search(queryVector, limit * 2, 0.1);

    // 3. Reciprocal Rank Fusion
    const scoreMap = new Map<string, {
      combinedScore: number;
      ftsRank: number | null;
      vectorRank: number | null;
      vectorScore: number | null;
    }>();

    // Ingest FTS ranks
    for (let i = 0; i < ftsRows.length; i++) {
      const mid = ftsRows[i]!.moment_id;
      const rank = i + 1;
      const rrfContribution = 1.0 / (rrfK + rank);

      scoreMap.set(mid, {
        combinedScore: rrfContribution,
        ftsRank: rank,
        vectorRank: null,
        vectorScore: null,
      });
    }

    // Ingest Vector ranks
    for (let i = 0; i < vectorMatches.length; i++) {
      const vm = vectorMatches[i]!;
      const rank = i + 1;
      const rrfContribution = 1.0 / (rrfK + rank);

      const existing = scoreMap.get(vm.momentId);
      if (existing) {
        existing.combinedScore += rrfContribution;
        existing.vectorRank = rank;
        existing.vectorScore = vm.score;
      } else {
        scoreMap.set(vm.momentId, {
          combinedScore: rrfContribution,
          ftsRank: null,
          vectorRank: rank,
          vectorScore: vm.score,
        });
      }
    }

    // Sort by combined RRF score descending
    const sorted = [...scoreMap.entries()].sort((a, b) => b[1].combinedScore - a[1].combinedScore);
    const topMomentIds = sorted.slice(0, limit);

    // Fetch moment metadata (app name, title) for the top hits
    const results: HybridSearchResult[] = [];
    for (const [mid, scoreData] of topMomentIds) {
      const momentRow = this.db.prepare(`
        SELECT app_name, window_title FROM moments WHERE id = ?
      `).get(mid) as { app_name: string; window_title: string } | undefined;

      results.push({
        momentId: mid,
        combinedScore: scoreData.combinedScore,
        ftsRank: scoreData.ftsRank,
        vectorRank: scoreData.vectorRank,
        vectorScore: scoreData.vectorScore,
        appName: momentRow?.app_name ?? 'Unknown',
        windowTitle: momentRow?.window_title ?? '',
      });
    }

    return results;
  }
}
