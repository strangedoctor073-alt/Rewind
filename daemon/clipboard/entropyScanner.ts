/**
 * @file entropyScanner.ts
 * @description Ghost Shield entropy scanner for REWIND v3 clipboard history.
 *
 * Detects and redacts high-entropy secrets from clipboard content before
 * they are persisted to the timeline database. This is a core privacy
 * invariant of REWIND (Trap 5 — Ghost Shield).
 *
 * Detection categories:
 *   - API keys / bearer tokens (high Shannon entropy + characteristic prefixes)
 *   - Private SSH / PEM keys (-----BEGIN ... KEY----- blocks)
 *   - Credit card numbers (Luhn-valid 13–19 digit sequences)
 *   - GitHub personal access tokens (ghp_*, gho_*, github_pat_*)
 *   - AWS access key IDs (AKIA prefix)
 *   - Hex secrets > 32 chars with entropy > 4.5 bits/char
 *
 * Safe content (normal text, code snippets, prose) passes through unchanged.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Shannon entropy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute Shannon entropy (bits per character) of a string.
 * Values above 4.5 indicate highly random content (keys, tokens, hashes).
 */
export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern matchers
// ─────────────────────────────────────────────────────────────────────────────

/** Patterns that always indicate a secret regardless of entropy */
const SECRET_PATTERNS: RegExp[] = [
  // PEM / SSH private keys
  /-----BEGIN\s+(?:RSA\s+|EC\s+|OPENSSH\s+|DSA\s+|PGP\s+)?PRIVATE KEY-----/i,
  // GitHub tokens
  /gh[pousr]_[A-Za-z0-9_]{36,}/,
  /github_pat_[A-Za-z0-9_]{82}/,
  // AWS access key ID
  /AKIA[0-9A-Z]{16}/,
  // Stripe keys
  /sk_(?:live|test)_[A-Za-z0-9]{24,}/,
  // Generic Bearer / Authorization headers
  /Bearer\s+[A-Za-z0-9\-_=]{32,}/i,
  // Hex strings of 40+ chars (SHA-1 hashes used as tokens, etc.)
  /\b[0-9a-f]{40,}\b/i,
  // Base64 token patterns (JWT-like)
  /eyJ[A-Za-z0-9\-_]{20,}\.eyJ[A-Za-z0-9\-_]{20,}\.[A-Za-z0-9\-_.+/=]{20,}/,
];

/** Luhn algorithm for credit card validation */
function isLuhnValid(digits: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i]!, 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

/** Credit card pattern: 13–19 digit sequences (with optional spaces/dashes) */
const CC_PATTERN = /\b(?:\d[ -]?){13,19}\b/g;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface ScanResult {
  /** Entropy score of the full string (0.0 – ~6.0 bits/char) */
  entropyScore: number;
  /** True if the content contains a detectable secret */
  isSecret: boolean;
  /** Human-readable reason(s) for flagging, or empty if clean */
  reasons: string[];
  /** Redacted version of the content (original if not secret) */
  redacted: string;
}

/**
 * Scan clipboard text content for secrets.
 * Returns a ScanResult with entropy score, flag, and a redacted copy.
 *
 * @param text  Raw clipboard text content
 */
export function scan(text: string): ScanResult {
  const reasons: string[] = [];
  let redacted = text;
  const entropy = shannonEntropy(text);

  // 1. Check known secret patterns
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(text)) {
      reasons.push(`Matches secret pattern: ${pattern.source.slice(0, 40)}`);
      redacted = redacted.replace(pattern, '[REDACTED]');
    }
  }

  // 2. Check for credit card numbers (Luhn-validated)
  const ccMatches = text.matchAll(CC_PATTERN);
  for (const match of ccMatches) {
    const digits = match[0]!.replace(/[ -]/g, '');
    if (digits.length >= 13 && isLuhnValid(digits)) {
      reasons.push('Luhn-valid credit card number detected');
      redacted = redacted.replace(match[0]!, '[REDACTED-CC]');
    }
  }

  // 3. High-entropy short token heuristic
  //    Tokens of 20-200 chars with entropy > 4.5 that look like single "words"
  if (reasons.length === 0 && entropy > 4.5) {
    const words = text.trim().split(/\s+/);
    for (const word of words) {
      if (word.length >= 20 && word.length <= 200) {
        const wordEntropy = shannonEntropy(word);
        if (wordEntropy > 4.5) {
          reasons.push(`High-entropy token (${wordEntropy.toFixed(2)} bits/char)`);
          redacted = redacted.replace(word, '[REDACTED]');
        }
      }
    }
  }

  return {
    entropyScore: entropy,
    isSecret: reasons.length > 0,
    reasons,
    redacted,
  };
}
