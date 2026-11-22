import React, { useState } from 'react'
import type { DashboardMoment } from '../types'
import type { ResurrectReportView } from '../hooks/daemonClient'

interface InspectorDrawerProps {
  moment: DashboardMoment | null
  onClose?: () => void
  onShowInGraph?: (moment: DashboardMoment) => void
  /** Present only when connected to a live daemon; reopens the editor files, terminals and tabs around a moment. */
  onResurrect?: (moment: DashboardMoment, dryRun: boolean) => Promise<ResurrectReportView>
  onUndo?: (moment: DashboardMoment) => Promise<void>
  undoBusy?: boolean
  undoFeedback?: string | null
}

export const InspectorDrawer: React.FC<InspectorDrawerProps> = ({ moment, onShowInGraph, onResurrect, onUndo, undoBusy = false, undoFeedback }) => {
  const [copyFeedback, setCopyFeedback] = useState<{ momentId: string; message: string } | null>(null)
  const [resurrectBusy, setResurrectBusy] = useState(false)
  const [resurrectResult, setResurrectResult] = useState<{ momentId: string; report: ResurrectReportView } | null>(null)
  const [resurrectError, setResurrectError] = useState<{ momentId: string; message: string } | null>(null)

  if (!moment) {
    return (
      <div className="gd-inspector" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <span style={{ fontSize: '2rem', opacity: 0.3 }}>⏱</span>
        <p style={{ fontSize: '0.85rem', color: '#a0aab5', marginTop: 12 }}>
          Select a moment in the Timeline to inspect its available evidence and recovery options.
        </p>
      </div>
    )
  }

  const handleCopyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopyFeedback({ momentId: moment.id, message: `Copied “${text}”` })
    } catch {
      setCopyFeedback({ momentId: moment.id, message: 'Clipboard access is unavailable' })
    }
    window.setTimeout(() => setCopyFeedback(null), 2400)
  }

  const runResurrect = async (dryRun: boolean) => {
    if (!onResurrect) return
    setResurrectBusy(true)
    setResurrectError(null)
    try {
      setResurrectResult({ momentId: moment.id, report: await onResurrect(moment, dryRun) })
    } catch (err) {
      setResurrectResult(null)
      setResurrectError({ momentId: moment.id, message: err instanceof Error ? err.message : 'Workspace restore failed' })
    } finally {
      setResurrectBusy(false)
    }
  }

  return (
    <div className="gd-inspector">
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="moment-node-badge">{moment.appName}</span>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            {new Date(moment.timestamp).toLocaleTimeString()}
          </span>
        </div>
        <h3 style={{ margin: '10px 0 4px 0', fontSize: '1rem', color: '#fff', wordBreak: 'break-word' }}>
          {moment.windowTitle}
        </h3>
        <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
          ID: {moment.id}
        </p>
      </div>

      <div className="inspector-preview" aria-label="Captured window evidence">
        {moment.screenshotUrl
          ? <img src={moment.screenshotUrl} alt={`Captured window from ${moment.appName}`} />
          : <div><strong>Preview unavailable</strong><span>No screenshot was provided for this moment.</span></div>}
      </div>

      <div>
        <div className="inspector-section-title">Geometry & Process</div>
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 8, fontSize: '0.78rem', color: '#cbd5e1' }}>
          <div>Bounds: {moment.bounds ? `${moment.bounds.width} × ${moment.bounds.height} (at ${moment.bounds.x}, ${moment.bounds.y})` : 'Not available'}</div>
          {moment.pid && <div style={{ marginTop: 4 }}>PID: {moment.pid}</div>}
          {moment.processPath && (
            <div style={{ marginTop: 4, wordBreak: 'break-all', opacity: 0.7 }}>
              Path: {moment.processPath}
            </div>
          )}
          {moment.gitBranch && (
            <div style={{ marginTop: 4, color: '#69d5a5' }}>
              Git branch: {moment.gitBranch}
            </div>
          )}
        </div>
      </div>

      {moment.ocrTokens && moment.ocrTokens.length > 0 && (
        <div>
          <div className="inspector-section-title">
            Interactive OCR Tokens (Click to Copy)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {moment.ocrTokens.map((t, idx) => (
              <button
                type="button"
                key={idx}
                className="ocr-token-chip"
                onClick={() => void handleCopyText(t.word)}
                title="Click to copy word to clipboard"
              >
                {t.word}
              </button>
            ))}
          </div>
        </div>
      )}

      {moment.domTarget && (
        <div>
          <div className="inspector-section-title">DOM Target Selector</div>
          <button
            type="button"
            className="inspector-copy-target"
            onClick={() => void handleCopyText(moment.domTarget!)}
            title="Click to copy CSS selector"
          >
            {moment.domTarget}
          </button>
        </div>
      )}

      {copyFeedback?.momentId === moment.id && <div role="status" className="inspector-action-feedback">{copyFeedback.message}</div>}

      <div>
        <div className="inspector-section-title">Workspace recovery</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="rewind-btn rewind-btn-primary"
            style={{ flex: 1, justifyContent: 'center' }}
            disabled={!onResurrect || resurrectBusy}
            title={onResurrect ? 'Reopen the editor files, terminals and browser tabs from around this moment' : 'Connect to the live daemon to use this'}
            onClick={() => void runResurrect(false)}
          >
            {resurrectBusy ? 'Working…' : 'Restore workspace'}
          </button>
          <button
            className="rewind-btn"
            disabled={!onResurrect || resurrectBusy}
            title="Show what would be reopened without launching anything"
            onClick={() => void runResurrect(true)}
          >
            Preview
          </button>
        </div>
        {resurrectError?.momentId === moment.id && <div role="alert" style={{ fontSize: '0.75rem', color: '#f0aaaa', marginTop: 6 }}>{resurrectError.message}</div>}
        {resurrectResult?.momentId === moment.id && (
          <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#cbd5e1' }}>
            {resurrectResult.report.dryRun && <div className="inspector-preview-note">Preview only — no applications were launched.</div>}
            {resurrectResult.report.results.length === 0 && <div>No applications were listed for this moment.</div>}
            {resurrectResult.report.results.map((r, idx) => (
              <div key={idx} style={{ marginBottom: 6 }}>
                <span style={{ color: r.status === 'failed' ? '#f87171' : r.status === 'skipped' ? '#fbbf24' : '#34d399' }}>
                  {r.status === 'launched' ? '✓' : r.status === 'planned' ? '•' : r.status === 'skipped' ? '–' : '✗'}
                </span>{' '}
                {r.label}
                <div style={{ opacity: 0.65, wordBreak: 'break-word' }}>{r.detail}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="inspector-recovery-actions">
        <button
          className="rewind-btn rewind-btn-primary"
          disabled={!onUndo || undoBusy}
          title={onUndo ? 'Send Ctrl+Z to the recorded application window. The app decides whether the action can be undone.' : 'Connect to a live daemon and select a recorded moment to use Undo.'}
          onClick={() => { if (onUndo) void onUndo(moment) }}
        >
          {undoBusy ? 'Sending…' : 'Send Ctrl+Z to app'}
        </button>
        <button
          className="rewind-btn"
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={() => {
            onShowInGraph?.(moment)
          }}
          title="Show this moment in the Graph view"
        >
          Show in Graph
        </button>
      </div>
      {undoFeedback && <div className="inspector-action-feedback" role="status">{undoFeedback}</div>}
    </div>
  )
}
