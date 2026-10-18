import React, { useState } from 'react'
import { audioEngine } from '../../audio/synth'
import type { DashboardMoment } from '../types'
import type { ResurrectReportView } from '../hooks/daemonClient'

interface InspectorDrawerProps {
  moment: DashboardMoment | null
  onClose?: () => void
  onJump?: (moment: DashboardMoment) => void
  /** Present only when connected to a live daemon; reopens the editor files, terminals and tabs around a moment. */
  onResurrect?: (moment: DashboardMoment, dryRun: boolean) => Promise<ResurrectReportView>
}

export const InspectorDrawer: React.FC<InspectorDrawerProps> = ({ moment, onJump, onResurrect }) => {
  const [copiedToken, setCopiedToken] = useState<string | null>(null)
  const [resurrectBusy, setResurrectBusy] = useState(false)
  const [resurrectReport, setResurrectReport] = useState<ResurrectReportView | null>(null)
  const [resurrectError, setResurrectError] = useState<string | null>(null)

  if (!moment) {
    return (
      <div className="gd-inspector" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <span style={{ fontSize: '2rem', opacity: 0.3 }}>⏱</span>
        <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: 12 }}>
          Select any node or filmstrip card to inspect OCR text, window bounds, and clipboard context.
        </p>
      </div>
    )
  }

  const handleCopyText = (text: string) => {
    navigator.clipboard?.writeText(text)
    audioEngine.playChime()
    setCopiedToken(text)
    setTimeout(() => setCopiedToken(null), 1800)
  }

  const runResurrect = async (dryRun: boolean) => {
    if (!onResurrect) return
    setResurrectBusy(true)
    setResurrectError(null)
    try {
      setResurrectReport(await onResurrect(moment, dryRun))
    } catch (err) {
      setResurrectReport(null)
      setResurrectError(err instanceof Error ? err.message : 'Resurrection failed')
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

      <div>
        <div className="inspector-section-title">Geometry & Process</div>
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: 10, borderRadius: 8, fontSize: '0.78rem', color: '#cbd5e1' }}>
          <div>Bounds: {moment.bounds?.width || 1280} × {moment.bounds?.height || 720} (at {moment.bounds?.x || 0}, {moment.bounds?.y || 0})</div>
          {moment.pid && <div style={{ marginTop: 4 }}>PID: {moment.pid}</div>}
          {moment.processPath && (
            <div style={{ marginTop: 4, wordBreak: 'break-all', opacity: 0.7 }}>
              Path: {moment.processPath}
            </div>
          )}
          {moment.gitBranch && (
            <div style={{ marginTop: 4, color: '#00f0ff' }}>
              Git Branch: 🌿 {moment.gitBranch}
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
              <span
                key={idx}
                className="ocr-token-chip"
                onClick={() => handleCopyText(t.word)}
                title="Click to copy word to clipboard"
              >
                {t.word}
              </span>
            ))}
          </div>
          {copiedToken && (
            <div style={{ fontSize: '0.72rem', color: '#10b981', marginTop: 6, textAlign: 'center' }}>
              ✓ Copied "{copiedToken}" to clipboard!
            </div>
          )}
        </div>
      )}

      {moment.domTarget && (
        <div>
          <div className="inspector-section-title">DOM Target Selector</div>
          <code
            style={{
              display: 'block',
              background: 'rgba(0,0,0,0.5)',
              padding: 8,
              borderRadius: 6,
              fontSize: '0.75rem',
              color: '#38bdf8',
              wordBreak: 'break-all',
              cursor: 'pointer',
            }}
            onClick={() => handleCopyText(moment.domTarget!)}
            title="Click to copy CSS selector"
          >
            {moment.domTarget}
          </code>
        </div>
      )}

      <div>
        <div className="inspector-section-title">Workspace Time Machine</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="rewind-btn rewind-btn-primary"
            style={{ flex: 1, justifyContent: 'center' }}
            disabled={!onResurrect || resurrectBusy}
            title={onResurrect ? 'Reopen the editor files, terminals and browser tabs from around this moment' : 'Connect to the live daemon to use this'}
            onClick={() => void runResurrect(false)}
          >
            {resurrectBusy ? 'Working…' : '⚡ Resurrect Workspace'}
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
        {resurrectError && <div style={{ fontSize: '0.75rem', color: '#f87171', marginTop: 6 }}>{resurrectError}</div>}
        {resurrectReport && (
          <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#cbd5e1' }}>
            {resurrectReport.results.length === 0 && <div>Nothing resurrectable was found around this moment.</div>}
            {resurrectReport.results.map((r, idx) => (
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

      <div style={{ marginTop: 'auto', display: 'flex', gap: 8 }}>
        <button
          className="rewind-btn rewind-btn-primary"
          style={{ flex: 1, justifyContent: 'center' }}
          onClick={() => {
            audioEngine.playWhoosh()
            onJump?.(moment)
          }}
        >
          ↶ Resurrect & Jump
        </button>
      </div>
    </div>
  )
}
