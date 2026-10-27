/**
 * @file embeddings.test.ts
 * Tests for DeterministicEmbeddingEngine, cosine similarity, and vector serialization.
 */

import { describe, it, expect } from 'vitest';
import {
  DeterministicEmbeddingEngine,
  cosineSimilarity,
  vectorToBuffer,
  bufferToVector,
  VECTOR_DIMENSIONS,
} from '../embeddings.js';

describe('DeterministicEmbeddingEngine', () => {
  const engine = new DeterministicEmbeddingEngine();

  it('produces unit vectors of length 384', async () => {
    const vec = await engine.embed('Hello world in REWIND');
    expect(vec.length).toBe(VECTOR_DIMENSIONS);

    let norm = 0;
    for (let i = 0; i < vec.length; i++) norm += vec[i]! * vec[i]!;
    expect(Math.sqrt(norm)).toBeCloseTo(1.0, 4);
  });

  it('is deterministic for identical text', async () => {
    const v1 = await engine.embed('VS Code: src/App.tsx');
    const v2 = await engine.embed('VS Code: src/App.tsx');
    expect(cosineSimilarity(v1, v2)).toBeCloseTo(1.0, 5);
  });

  it('gives high similarity for conceptually similar texts', async () => {
    const v1 = await engine.embed('Git commit refactor auth middleware');
    const v2 = await engine.embed('Refactor auth middleware commit');
    const v3 = await engine.embed('Figma UI design invoice illustration');

    const simRelated = cosineSimilarity(v1, v2);
    const simUnrelated = cosineSimilarity(v1, v3);

    expect(simRelated).toBeGreaterThan(0.6);
    expect(simRelated).toBeGreaterThan(simUnrelated);
  });

  it('serializes and deserializes cleanly via buffer', async () => {
    const original = await engine.embed('Test vector buffer roundtrip');
    const buf = vectorToBuffer(original);
    const roundtrip = bufferToVector(buf);

    expect(roundtrip.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(roundtrip[i]).toBe(original[i]);
    }
  });

  it('handles empty input gracefully', async () => {
    const empty = await engine.embed('');
    expect(empty.length).toBe(VECTOR_DIMENSIONS);
  });

  it('batches embeddings properly', async () => {
    const batch = await engine.embedBatch(['First text', 'Second text']);
    expect(batch).toHaveLength(2);
    expect(batch[0]!.length).toBe(VECTOR_DIMENSIONS);
  });
});
