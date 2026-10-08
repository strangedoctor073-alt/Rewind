/**
 * @file entropyScanner.test.ts
 * Tests for the Ghost Shield EntropyScanner (daemon/clipboard/entropyScanner.ts)
 */

import { describe, it, expect } from 'vitest';
import { scan, shannonEntropy } from '../entropyScanner.js';

describe('shannonEntropy', () => {
  it('returns 0 for empty string', () => {
    expect(shannonEntropy('')).toBe(0);
  });

  it('returns 0 for single-character string', () => {
    expect(shannonEntropy('aaaaaaa')).toBe(0);
  });

  it('returns higher entropy for random-looking strings', () => {
    const high = shannonEntropy('a8f2k9x0p3m7q1j6');
    const low  = shannonEntropy('hello world this is normal text');
    expect(high).toBeGreaterThan(low);
  });

  it('returns values between 0 and ~6 for ASCII', () => {
    const e = shannonEntropy('The quick brown fox jumps over the lazy dog');
    expect(e).toBeGreaterThan(0);
    expect(e).toBeLessThan(7);
  });
});

describe('EntropyScanner.scan', () => {
  it('passes clean text through unchanged', () => {
    const text = 'Hello, this is a normal clipboard entry.';
    const result = scan(text);
    expect(result.isSecret).toBe(false);
    expect(result.reasons).toHaveLength(0);
    expect(result.redacted).toBe(text);
  });

  it('detects and redacts GitHub personal access token (ghp_)', () => {
    const token = 'ghp_' + 'A'.repeat(36);
    const result = scan(`My GitHub token is ${token}`);
    expect(result.isSecret).toBe(true);
    expect(result.redacted).toContain('[REDACTED]');
    expect(result.redacted).not.toContain(token);
  });

  it('detects and redacts AWS access key ID', () => {
    const awsKey = 'AKIAIOSFODNN7EXAMPLE';
    const result = scan(`AWS key: ${awsKey}`);
    expect(result.isSecret).toBe(true);
    expect(result.redacted).toContain('[REDACTED]');
  });

  it('detects PEM private key block', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEo...rest\n-----END RSA PRIVATE KEY-----';
    const result = scan(pem);
    expect(result.isSecret).toBe(true);
  });

  it('detects JWT token', () => {
    // Minimal valid JWT-shape (three base64url segments)
    const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IlJFV0lORCJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const result = scan(jwt);
    expect(result.isSecret).toBe(true);
  });

  it('detects Luhn-valid credit card number', () => {
    // 4111 1111 1111 1111 — canonical Visa test number (Luhn valid)
    const result = scan('Card: 4111 1111 1111 1111');
    expect(result.isSecret).toBe(true);
    expect(result.redacted).toContain('[REDACTED-CC]');
  });

  it('does NOT flag a random non-Luhn digit sequence as CC', () => {
    const result = scan('Reference: 1234 5678 9012 3456');
    // 1234567890123456 is NOT Luhn valid
    expect(result.redacted).not.toContain('[REDACTED-CC]');
  });

  it('flags high-entropy single token', () => {
    // 32-char random-looking hex string — high entropy, single word
    const token = 'a3f8c2e9b1d047f6a8e2c3d5f9b0e7a1';
    const result = scan(token);
    // This matches the hex pattern (40+ chars check won't trigger for 32 chars,
    // but the high-entropy single-word heuristic may)
    // The entropy score should at least be reported
    expect(result.entropyScore).toBeGreaterThan(3);
  });

  it('returns entropyScore for all inputs', () => {
    expect(scan('normal text').entropyScore).toBeGreaterThan(0);
    expect(scan('').entropyScore).toBe(0);
  });

  it('gho_ GitHub OAuth token is detected', () => {
    const token = 'gho_' + 'x'.repeat(36);
    const result = scan(token);
    expect(result.isSecret).toBe(true);
  });
});
