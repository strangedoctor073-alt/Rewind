/**
 * StandupModal.tsx
 * Daily Standup, Timesheet & Commit Summary Generator UI modal for REWIND v4.0 & v6.0.
 */

import { useCallback, useEffect, useState } from 'react';
import { callDaemon } from '../hooks/daemonClient';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function StandupModal({ isOpen, onClose }: Props) {
  const [summaryType, setSummaryType] = useState<'daily_standup' | 'timesheet' | 'commit_draft'>('daily_standup');
  const [summaryText, setSummaryText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [ollamaStatus, setOllamaStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('llama3:8b');

  // Check Ollama connection on open
  useEffect(() => {
    if (!isOpen) return;
    let isCancelled = false;

    fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(1500) })
      .then((res) => res.json())
      .then((data: { models?: Array<{ name: string }> }) => {
        if (isCancelled) return;
        setOllamaStatus('online');
        if (data?.models && Array.isArray(data.models) && data.models.length > 0) {
          const names = data.models.map((m) => m.name);
          setModels(names);
          if (!names.includes(selectedModel)) {
            setSelectedModel(names[0]);
          }
        }
      })
      .catch(() => {
        if (isCancelled) return;
        setOllamaStatus('offline');
      });

    return () => {
      isCancelled = true;
    };
  }, [isOpen, selectedModel]);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    try {
      const data = await callDaemon<{ markdown: string }>('ai.standup', {
        type: summaryType,
        model: selectedModel,
      });
      if (data && typeof data.markdown === 'string') {
        setSummaryText(data.markdown);
      } else {
        setSummaryText('Failed to generate summary. Please ensure REWIND daemon is running.');
      }
    } catch {
      setSummaryText('Failed to connect to REWIND AI daemon. Ensure daemon is running on port 48292.');
    } finally {
      setLoading(false);
    }
  }, [summaryType, selectedModel]);

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.25rem' }}>🧠</span>
            <div>
              <div style={styles.title}>Cognitive AI Recall & Standup</div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>
                Local LLM synthesis via Ollama (127.0.0.1:11434) with zero-crash heuristics fallback
              </div>
            </div>
          </div>
          <button style={styles.closeBtn} onClick={onClose}>×</button>
        </div>

        {/* Ollama Connection Status Banner */}
        <div style={{
          padding: '10px 18px',
          background: ollamaStatus === 'online' ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
          borderBottom: `1px solid ${ollamaStatus === 'online' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: ollamaStatus === 'online' ? '#10b981' : ollamaStatus === 'offline' ? '#f59e0b' : '#94a3b8',
              boxShadow: ollamaStatus === 'online' ? '0 0 8px #10b981' : '0 0 6px #f59e0b',
            }} />
            <span style={{ color: ollamaStatus === 'online' ? '#34d399' : '#fbbf24', fontWeight: 600 }}>
              {ollamaStatus === 'checking'
                ? 'Probing local Ollama service...'
                : ollamaStatus === 'online'
                ? 'Ollama Local LLM Connected (http://127.0.0.1:11434)'
                : 'Ollama Offline — Using Local Cognitive Heuristics'}
            </span>
          </div>

          {ollamaStatus === 'online' && models.length > 0 && (
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{
                background: '#0f172a',
                color: '#38bdf8',
                border: '1px solid #334155',
                borderRadius: 6,
                padding: '3px 8px',
                fontSize: '0.72rem',
                cursor: 'pointer',
              }}
            >
              {models.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}

          {ollamaStatus === 'offline' && (
            <span style={{ color: '#94a3b8', fontSize: '0.7rem' }}>
              Tip: run <code style={{ color: '#00f0ff' }}>ollama serve</code> to enable Llama3/Mistral
            </span>
          )}
        </div>

        <div style={styles.tabs}>
          <button
            style={summaryType === 'daily_standup' ? styles.activeTab : styles.tab}
            onClick={() => setSummaryType('daily_standup')}
          >
            📋 Daily Standup
          </button>
          <button
            style={summaryType === 'timesheet' ? styles.activeTab : styles.tab}
            onClick={() => setSummaryType('timesheet')}
          >
            ⏱️ Timesheet
          </button>
          <button
            style={summaryType === 'commit_draft' ? styles.activeTab : styles.tab}
            onClick={() => setSummaryType('commit_draft')}
          >
            🌿 Commit Draft
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
              Click <strong>Generate Summary</strong> to synthesize your recent desktop activity into a polished report using local AI.
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
