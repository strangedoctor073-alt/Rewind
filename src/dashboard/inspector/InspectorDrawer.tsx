import React, { useState } from 'react'
import { audioEngine } from '../../audio/synth'
import type { DashboardMoment } from '../types'

interface InspectorDrawerProps {
  moment: DashboardMoment | null
  onClose?: () => void
  onJump?: (moment: DashboardMoment) => void
}

export const InspectorDrawer: React.FC<InspectorDrawerProps> = ({ moment, onJump }) => {
  const [copiedToken, setCopiedToken] = useState<string | null>(null)

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
