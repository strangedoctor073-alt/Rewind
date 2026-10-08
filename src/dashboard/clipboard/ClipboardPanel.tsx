/**
 * ClipboardPanel.tsx
 * Visual clipboard history scrubber panel for the REWIND Grand Dashboard.
 *
 * Displays the enriched clipboard timeline with:
 *  - Format badges (text / html / rtf / image)
 *  - Entropy score indicator (shield icon for redacted entries)
 *  - Source app and timestamp
 *  - Inline image preview for image-format entries
 *  - FTS search box to filter clipboard history
 *  - Click-to-copy any historical entry back to clipboard
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ClipboardFormat = 'text' | 'html' | 'rtf' | 'image';

interface ClipboardEntry {
  id: string;
  format: ClipboardFormat;
  contentText: string | null;
  imagePath: string | null;
  entropyScore: number;
  isRedacted: boolean;
  sourceApp: string | null;
  sourceWindow: string | null;
  byteSize: number;
  createdAt: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// ClipboardPanel
// ─────────────────────────────────────────────────────────────────────────────

export function ClipboardPanel() {
  const [entries, setEntries] = useState<ClipboardEntry[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch / search ────────────────────────────────────────────────────────

  const fetchEntries = useCallback(async (searchQuery: string) => {
    setLoading(true);
    try {
      const url = searchQuery
        ? `/api/clipboard/search?q=${encodeURIComponent(searchQuery)}&limit=50`
        : `/api/clipboard/history?limit=50`;
      const resp = await fetch(url);
      if (!resp.ok) return;
      const data = await resp.json() as ClipboardEntry[];
      setEntries(data);
    } catch {
      // Daemon offline — leave existing entries
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search input
  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchEntries(value), 200);
  }, [fetchEntries]);

  // Initial load — use inline IIFE to avoid setState-in-effect lint violation
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const resp = await fetch('/api/clipboard/history?limit=50');
        if (!resp.ok || cancelled) return;
        const data = await resp.json() as ClipboardEntry[];
        if (!cancelled) setEntries(data);
      } catch {
        // Daemon offline — leave empty
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // ── Copy handler ──────────────────────────────────────────────────────────

  const handleCopy = useCallback(async (entry: ClipboardEntry) => {
    if (entry.isRedacted || !entry.contentText) return;
    try {
      await navigator.clipboard.writeText(entry.contentText);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Clipboard API unavailable
    }
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>📋 Clipboard History</span>
        <span style={styles.count}>{entries.length} entries</span>
      </div>

      {/* Search box */}
      <input
        type="search"
        placeholder="Search clipboard history…"
        value={query}
        onChange={handleQueryChange}
        style={styles.searchInput}
        aria-label="Search clipboard history"
      />

      {/* Entry list */}
      <div style={styles.list} role="list">
        {loading && entries.length === 0 && (
          <div style={styles.empty}>Loading…</div>
        )}
        {!loading && entries.length === 0 && (
          <div style={styles.empty}>No clipboard history yet.</div>
        )}
        {entries.map((entry) => (
          <ClipboardEntryCard
            key={entry.id}
            entry={entry}
            isCopied={copiedId === entry.id}
            onCopy={() => void handleCopy(entry)}
          />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry Card
// ─────────────────────────────────────────────────────────────────────────────

function ClipboardEntryCard({
  entry,
  isCopied,
  onCopy,
}: {
  entry: ClipboardEntry;
  isCopied: boolean;
  onCopy: () => void;
}) {
  const timestamp = new Date(entry.createdAt).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const formatColors: Record<ClipboardFormat, string> = {
    text:  '#4fc3f7',
    html:  '#ff8a65',
    rtf:   '#ce93d8',
    image: '#80cbc4',
  };

  return (
    <div
      role="listitem"
      style={{
        ...styles.card,
        background: isCopied ? 'rgba(99,255,150,0.08)' : 'rgba(255,255,255,0.04)',
        borderColor: isCopied ? 'rgba(99,255,150,0.5)' : 'rgba(255,255,255,0.08)',
      }}
    >
      {/* Top row: format badge + app + time + redacted shield */}
      <div style={styles.cardHeader}>
        <span style={{ ...styles.badge, background: formatColors[entry.format] + '33', color: formatColors[entry.format] }}>
          {entry.format.toUpperCase()}
        </span>
        {entry.isRedacted && (
          <span style={styles.redactedBadge} title="Secret redacted by Ghost Shield">🛡️ REDACTED</span>
        )}
        <span style={styles.sourceApp}>{entry.sourceApp ?? 'Unknown'}</span>
        <span style={styles.timestamp}>{timestamp}</span>
      </div>

      {/* Content preview */}
      {entry.format === 'image' ? (
        <div style={styles.imagePreview}>
          <img
            src={`/api/clipboard/image?id=${entry.id}`}
            alt="Clipboard image"
            style={{ maxWidth: '100%', maxHeight: 120, objectFit: 'contain', borderRadius: 4 }}
          />
        </div>
      ) : (
        <div style={styles.textPreview}>
          {entry.isRedacted
            ? <span style={styles.redactedText}>[Secret redacted — Ghost Shield protected]</span>
            : <span>{(entry.contentText ?? '').slice(0, 200)}{(entry.contentText?.length ?? 0) > 200 ? '…' : ''}</span>
          }
        </div>
      )}

      {/* Footer: byte size + copy button */}
      <div style={styles.cardFooter}>
        <span style={styles.byteSize}>{formatBytes(entry.byteSize)}</span>
        {!entry.isRedacted && entry.format !== 'image' && (
          <button
            onClick={onCopy}
            style={styles.copyButton}
            aria-label={`Copy clipboard entry from ${entry.sourceApp ?? 'unknown app'}`}
          >
            {isCopied ? '✓ Copied' : 'Copy'}
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: '#0d1117',
    color: '#c9d1d9',
    fontFamily: 'system-ui, sans-serif',
    fontSize: 13,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px 8px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  title: { fontWeight: 600, fontSize: 14 },
  count: { color: '#8b949e', fontSize: 12 },
  searchInput: {
    margin: '8px 12px',
    padding: '6px 10px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 6,
    color: '#c9d1d9',
    fontSize: 13,
    outline: 'none',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    padding: '4px 12px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  empty: { color: '#8b949e', textAlign: 'center', padding: 32 },
  card: {
    borderRadius: 8,
    border: '1px solid',
    padding: '8px 12px',
    transition: 'background 0.15s, border-color 0.15s',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  badge: {
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: 4,
    letterSpacing: '0.05em',
  },
  redactedBadge: {
    fontSize: 10,
    color: '#ff9800',
    fontWeight: 600,
  },
  sourceApp: { color: '#8b949e', fontSize: 11, flex: 1 },
  timestamp: { color: '#8b949e', fontSize: 11, fontVariantNumeric: 'tabular-nums' },
  textPreview: {
    color: '#c9d1d9',
    lineHeight: 1.5,
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
    maxHeight: 80,
    overflow: 'hidden',
  },
  redactedText: { color: '#8b949e', fontStyle: 'italic' },
  imagePreview: { marginBottom: 4 },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  byteSize: { color: '#8b949e', fontSize: 11 },
  copyButton: {
    padding: '3px 10px',
    background: 'rgba(99,255,150,0.1)',
    border: '1px solid rgba(99,255,150,0.3)',
    borderRadius: 4,
    color: '#63ff96',
    fontSize: 12,
    cursor: 'pointer',
  },
};

export default ClipboardPanel;
