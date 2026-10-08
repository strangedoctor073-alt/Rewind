/**
 * @file ollamaConnector.ts
 * @description Local LLM interface for REWIND v4.0 Cognitive Recall.
 *
 * Connects to Ollama (http://127.0.0.1:11434) for:
 *  - Automated Daily Standup Summaries ("What did I work on today?")
 *  - Timesheet activity categorization
 *  - Commit message drafting from timeline diffs
 *
 * Includes zero-crash offline heuristic fallback when Ollama is not running.
 */

import http from 'node:http';

export interface GenerateSummaryOptions {
  periodStart: number;
  periodEnd: number;
  moments: {
    appName: string;
    windowTitle: string;
    timestamp: number;
  }[];
  model?: string;
  summaryType?: 'daily_standup' | 'timesheet' | 'commit_draft';
}

export interface SummaryResult {
  markdown: string;
  appsInvolved: string[];
  momentCount: number;
  modelUsed: string;
}

export class OllamaConnector {
  private readonly baseUrl: string;
  private readonly defaultModel: string;

  constructor(baseUrl = 'http://127.0.0.1:11434', defaultModel = 'llama3:8b') {
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
  }

  /**
   * Check if local Ollama daemon is reachable.
   */
  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const url = new URL('/api/tags', this.baseUrl);
        const req = http.get(url, { timeout: 1500 }, (res) => {
          resolve(res.statusCode === 200);
        });
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Synthesize a summary from a sequence of activity moments.
   */
  async generateSummary(opts: GenerateSummaryOptions): Promise<SummaryResult> {
    const { moments, model = this.defaultModel, summaryType = 'daily_standup' } = opts;

    // Aggregate app frequency
    const appCounts = new Map<string, number>();
    for (const m of moments) {
      appCounts.set(m.appName, (appCounts.get(m.appName) ?? 0) + 1);
    }
    const appsInvolved = [...appCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    // If Ollama is available, query it
    const available = await this.isAvailable();
    if (available && moments.length > 0) {
      try {
        const prompt = this.buildPrompt(moments, summaryType);
        const responseText = await this.queryOllama(prompt, model);
        return {
          markdown: responseText,
          appsInvolved,
          momentCount: moments.length,
          modelUsed: model,
        };
      } catch {
        // Fall back to rule-based generator
      }
    }

    // Offline rule-based fallback generator
    return {
      markdown: this.generateRuleBasedSummary(moments, appsInvolved, summaryType),
      appsInvolved,
      momentCount: moments.length,
      modelUsed: 'heuristic-fallback',
    };
  }

  private buildPrompt(
    moments: { appName: string; windowTitle: string }[],
    type: 'daily_standup' | 'timesheet' | 'commit_draft'
  ): string {
    const sample = moments.slice(0, 30).map((m) => `- [${m.appName}] ${m.windowTitle}`).join('\n');
    return `You are REWIND AI, a privacy-respecting work intelligence assistant.
Analyze this user's timeline activity and generate a concise markdown ${type}:

${sample}

Focus on key tasks completed, tools used, and logical milestones. Keep it punchy and professional.`;
  }

  private queryOllama(prompt: string, model: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL('/api/generate', this.baseUrl);
      const postData = JSON.stringify({
        model,
        prompt,
        stream: false,
      });

      const req = http.request(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
          },
          timeout: 10000,
        },
        (res) => {
          let body = '';
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            try {
              const parsed = JSON.parse(body) as { response?: string };
              if (parsed.response) {
                resolve(parsed.response.trim());
              } else {
                reject(new Error('Empty response from Ollama'));
              }
            } catch (err) {
              reject(err);
            }
          });
        }
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Ollama request timed out'));
      });

      req.write(postData);
      req.end();
    });
  }

  private generateRuleBasedSummary(
    moments: { appName: string; windowTitle: string }[],
    apps: string[],
    type: 'daily_standup' | 'timesheet' | 'commit_draft'
  ): string {
    if (moments.length === 0) {
      return `### Activity Summary\nNo recorded moments during this period.`;
    }

    const topApps = apps.slice(0, 4).join(', ');
    const uniqueTitles = [...new Set(moments.map((m) => m.windowTitle))].slice(0, 5);

    if (type === 'commit_draft') {
      return `### Proposed Commit Summary\n- Refined tasks across **${topApps}**\n${uniqueTitles.map((t) => `  - Context: ${t}`).join('\n')}`;
    }

    return `### Daily Standup Summary (Generated by REWIND)\n\n` +
      `**Key Focus Areas & Apps:** ${topApps}\n` +
      `**Total Recorded Moments:** ${moments.length}\n\n` +
      `**Active Tasks & Documents:**\n` +
      uniqueTitles.map((t) => `- ${t}`).join('\n') +
      `\n\n*(Note: Generated via local heuristic engine. Connect Ollama at localhost:11434 for deep LLM synthesis.)*`;
  }
}
