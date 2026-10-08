/**
 * StandupModal.tsx
 * Daily Standup, Timesheet & Commit Summary Generator UI modal for REWIND v4.0.
 */

import { useCallback, useState } from 'react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function StandupModal({ isOpen, onClose }: Props) {
  const [summaryType, setSummaryType] = useState<'daily_standup' | 'timesheet' | 'commit_draft'>('daily_standup');
  const [summaryText, setSummaryText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/ai/standup?type=${summaryType}`);
      if (resp.ok) {
        const data = await resp.json() as { markdown: string };
        setSummaryText(data.markdown);
      } else {
        setSummaryText('Failed to generate summary. Please ensure REWIND daemon is running.');
      }
    } catch {
      setSummaryText('Failed to connect to REWIND AI daemon.');
    } finally {
      setLoading(false);
    }
  }, [summaryType]);

  const handleCopy = useCallback(async () => {
    if (!summaryText) return;
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable
    }
  }, [summaryText]);

  if (!isOpen) return null;

  return (
    <div style={styles.backdrop} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}>🧠 Cognitive Standup & Summary</span>
          <button style={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        <div style={styles.tabs}>
          <button
            style={summaryType === 'daily_standup' ? styles.activeTab : styles.tab}
            onClick={() => setSummaryType('daily_standup')}
          >
            Daily Standup
          </button>
          <button
            style={summaryType === 'timesheet' ? styles.activeTab : styles.tab}
            onClick={() => setSummaryType('timesheet')}
          >
            Timesheet
          </button>
          <button
            style={summaryType === 'commit_draft' ? styles.activeTab : styles.tab}
            onClick={() => setSummaryType('commit_draft')}
          >
            Commit Draft
          </button>
        </div>

        <div style={styles.body}>
          {summaryText ? (
            <textarea
              readOnly
              value={summaryText}
              style={styles.textarea}
            />
          ) : (
            <div style={styles.placeholder}>
              Click Generate to synthesize your recent activity using local AI (Ollama or Cognitive Heuristics).
            </div>
          )}
        </div>

        <div style={styles.footer}>
          <button
            style={styles.genBtn}
            onClick={() => void handleGenerate()}
            disabled={loading}
          >
            {loading ? 'Synthesizing…' : '⚡ Generate Summary'}
          </button>
          {summaryText && (
            <button style={styles.copyBtn} onClick={() => void handleCopy()}>
              {copied ? '✓ Copied' : '📋 Copy Markdown'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#161b22',
    border: '1px solid #30363d',
    borderRadius: 12,
    width: 600,
    maxWidth: '90vw',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
    color: '#c9d1d9',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #21262d',
  },
  title: {
    fontWeight: 600,
    fontSize: 15,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#8b949e',
    fontSize: 20,
    cursor: 'pointer',
  },
  tabs: {
    display: 'flex',
    padding: '8px 20px',
    gap: 8,
    borderBottom: '1px solid #21262d',
  },
  tab: {
    background: 'transparent',
    border: 'none',
    color: '#8b949e',
    padding: '6px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
  },
  activeTab: {
    background: '#21262d',
    border: 'none',
    color: '#58a6ff',
    padding: '6px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
  },
  body: {
    padding: 20,
    minHeight: 180,
    display: 'flex',
  },
  placeholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    color: '#8b949e',
    textAlign: 'center',
    fontSize: 13,
  },
  textarea: {
    width: '100%',
    minHeight: 200,
    background: '#0d1117',
    border: '1px solid #30363d',
    borderRadius: 8,
    color: '#c9d1d9',
    padding: 12,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 1.5,
    resize: 'vertical',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    padding: '12px 20px',
    borderTop: '1px solid #21262d',
  },
  genBtn: {
    background: '#238636',
    border: 'none',
    borderRadius: 6,
    color: '#fff',
    padding: '8px 16px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
  },
  copyBtn: {
    background: '#21262d',
    border: '1px solid #30363d',
    borderRadius: 6,
    color: '#c9d1d9',
    padding: '8px 16px',
    fontSize: 13,
    cursor: 'pointer',
  },
};
