/**
 * @file hybridSearch.test.ts
 * Tests for VectorStore, HybridSearchEngine, and Reciprocal Rank Fusion (RRF).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { DeterministicEmbeddingEngine } from '../embeddings.js';
import { VectorStore } from '../vectorStore.js';
import { HybridSearchEngine } from '../hybridSearch.js';

describe('VectorStore & HybridSearchEngine', () => {
  let db: Database.Database;
  let vectorStore: VectorStore;
  let engine: DeterministicEmbeddingEngine;
  let hybridSearch: HybridSearchEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE moments (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        app_name TEXT NOT NULL,
        window_title TEXT NOT NULL,
        process_path TEXT,
        pid INTEGER,
        bounds_x INTEGER,
        bounds_y INTEGER,
        bounds_w INTEGER,
        bounds_h INTEGER,
        phash TEXT,
        screenshot_path TEXT,
        is_closed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE VIRTUAL TABLE timeline_fts USING fts5(
        moment_id UNINDEXED,
        app_name,
        window_title,
        ocr_content,
        dom_content,
        tokenize = 'porter unicode61'
      );

      CREATE TABLE moment_embeddings (
        moment_id TEXT PRIMARY KEY,
        embedding_blob BLOB NOT NULL,
        dimensions INTEGER NOT NULL,
        source_text TEXT NOT NULL,
        model_version TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    vectorStore = new VectorStore(db);
    engine = new DeterministicEmbeddingEngine();
    hybridSearch = new HybridSearchEngine(db, vectorStore, engine);
  });

  afterEach(() => {
    db.close();
  });

  it('stores and retrieves vectors via VectorStore', async () => {
    const v = await engine.embed('Terminal docker build error');
    vectorStore.saveEmbedding('m1', v, 'Terminal docker build error');

    expect(vectorStore.count()).toBe(1);
    const retrieved = vectorStore.getEmbedding('m1');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.length).toBe(384);
  });

  it('finds top-k nearest moments via vector search', async () => {
    const v1 = await engine.embed('Terminal docker port 8080 collision');
    const v2 = await engine.embed('VS Code: package.json dependencies');
    const v3 = await engine.embed('Spotify Playing music track');

    vectorStore.saveEmbedding('m1', v1, 'docker port 8080');
    vectorStore.saveEmbedding('m2', v2, 'package.json dependencies');
    vectorStore.saveEmbedding('m3', v3, 'Spotify Playing music track');

    const queryVec = await engine.embed('docker port error in terminal');
    const results = vectorStore.search(queryVec, 2, 0.2);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.momentId).toBe('m1');
  });

  it('performs hybrid search combining FTS5 and vector similarity', async () => {
    // Insert mock moments
    db.prepare(`
      INSERT INTO moments (id, timestamp, app_name, window_title)
      VALUES 
        ('m1', 1000, 'Windows Terminal', 'Docker build failed with port 8080 in use'),
        ('m2', 2000, 'Code.exe', 'server.ts - REWIND auth refactor'),
        ('m3', 3000, 'Chrome.exe', 'StackOverflow - Docker bind address already in use')
    `).run();

    // Index into FTS5
    db.prepare(`
      INSERT INTO timeline_fts (moment_id, app_name, window_title, ocr_content, dom_content)
      VALUES 
        ('m1', 'Windows Terminal', 'Docker build failed with port 8080 in use', 'error bind 8080', ''),
        ('m2', 'Code.exe', 'server.ts - REWIND auth refactor', 'import express', ''),
        ('m3', 'Chrome.exe', 'StackOverflow - Docker bind address already in use', 'solution for port collision', '')
    `).run();

    // Embed and index vectors
    const v1 = await engine.embed('Docker build failed with port 8080 in use');
    const v2 = await engine.embed('server.ts - REWIND auth refactor');
    const v3 = await engine.embed('StackOverflow - Docker bind address already in use');

    vectorStore.saveEmbedding('m1', v1, 'Docker build failed with port 8080 in use');
    vectorStore.saveEmbedding('m2', v2, 'server.ts - REWIND auth refactor');
    vectorStore.saveEmbedding('m3', v3, 'StackOverflow - Docker bind address already in use');

    // Query hybrid
    const results = await hybridSearch.search('Docker port collision', 5);

    expect(results.length).toBeGreaterThan(0);
    // Moments m1 and m3 should dominate over m2 (unrelated auth refactor)
    const topIds = results.slice(0, 2).map((r) => r.momentId);
    expect(topIds).toContain('m1');
    expect(topIds).toContain('m3');
  });
});
