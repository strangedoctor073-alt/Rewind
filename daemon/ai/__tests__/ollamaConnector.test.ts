/**
 * @file ollamaConnector.test.ts
 * Tests for OllamaConnector and offline heuristic summary generation.
 */

import { describe, it, expect } from 'vitest';
import { OllamaConnector } from '../ollamaConnector.js';

describe('OllamaConnector', () => {
  const connector = new OllamaConnector('http://127.0.0.1:11434');

  it('checks availability gracefully without crashing', async () => {
    // Should return false when no local server is listening, but never throw
    const available = await connector.isAvailable();
    expect(typeof available).toBe('boolean');
  });

  it('generates heuristic daily standup summary when offline', async () => {
    const moments = [
      { appName: 'Code.exe', windowTitle: 'embeddings.ts - REWIND', timestamp: 1000 },
      { appName: 'Code.exe', windowTitle: 'vectorStore.ts - REWIND', timestamp: 2000 },
      { appName: 'Windows Terminal', windowTitle: 'pwsh: npm test', timestamp: 3000 },
      { appName: 'Chrome.exe', windowTitle: 'GitHub - Pull Requests', timestamp: 4000 },
    ];

    const result = await connector.generateSummary({
      periodStart: 1000,
      periodEnd: 4000,
      moments,
      summaryType: 'daily_standup',
    });

    expect(result.markdown).toContain('Daily Standup Summary');
    expect(result.appsInvolved).toContain('Code.exe');
    expect(result.appsInvolved).toContain('Windows Terminal');
    expect(result.momentCount).toBe(4);
    expect(result.modelUsed).toBe('heuristic-fallback');
  });

  it('generates heuristic commit draft summary', async () => {
    const moments = [
      { appName: 'Code.exe', windowTitle: 'feature/ai-recall', timestamp: 1000 },
    ];

    const result = await connector.generateSummary({
      periodStart: 1000,
      periodEnd: 1000,
      moments,
      summaryType: 'commit_draft',
    });

    expect(result.markdown).toContain('Proposed Commit Summary');
    expect(result.markdown).toContain('Code.exe');
  });

  it('handles empty moments list gracefully', async () => {
    const result = await connector.generateSummary({
      periodStart: 0,
      periodEnd: 0,
      moments: [],
    });

    expect(result.markdown).toContain('No recorded moments');
    expect(result.momentCount).toBe(0);
  });
});
