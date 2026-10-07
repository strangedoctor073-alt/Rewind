import React from 'react'
import { audioEngine } from '../../audio/synth'
import type { DashboardMoment } from '../types'

interface FilmstripViewProps {
  moments: DashboardMoment[]
  selectedMomentId?: string
  onSelectMoment: (moment: DashboardMoment) => void
  onJumpMoment: (moment: DashboardMoment) => void
}

export const FilmstripView: React.FC<FilmstripViewProps> = ({
  moments,
  selectedMomentId,
  onSelectMoment,
  onJumpMoment,
}) => {
  return (
    <div className="filmstrip-container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#fff' }}>Filmstrip Scrubber</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
            Chronological horizontal filmstrip with tactile audio ticks and instant window geometry previews.
          </p>
        </div>
        <div style={{ fontSize: '0.8rem', color: '#00f0ff' }}>
          {moments.length} moments recorded
        </div>
      </div>

      <div className="filmstrip-scroll">
        {moments.map((moment, idx) => {
          const isSelected = moment.id === selectedMomentId
          return (
            <div
              key={moment.id}
              className={`filmstrip-card ${isSelected ? 'active' : ''}`}
              onClick={() => onSelectMoment(moment)}
              onMouseEnter={() => audioEngine.playTick(1.0 + (idx % 5) * 0.1)}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="moment-node-badge">{moment.appName}</span>
                  <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                    {new Date(moment.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>

                <div
                  style={{
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    color: '#fff',
                    marginBottom: 10,
                    lineHeight: 1.3,
                  }}
                >
                  {moment.windowTitle}
                </div>
              </div>

              <div
                style={{
                  height: '120px',
                  borderRadius: '8px',
                  background: 'rgba(0,0,0,0.4)',
                  border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '10px',
                  textAlign: 'center',
                  fontSize: '0.75rem',
                  color: '#94a3b8',
                }}
              >
                {moment.ocrText ? (
                  <span style={{ fontStyle: 'italic' }}>"{moment.ocrText.slice(0, 70)}..."</span>
                ) : (
                  <span>Window: {moment.bounds?.width || 1280} × {moment.bounds?.height || 720}</span>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                {moment.gitBranch ? (
                  <span style={{ fontSize: '0.7rem', color: '#00f0ff' }}>🌿 {moment.gitBranch}</span>
                ) : (
                  <span style={{ fontSize: '0.7rem', color: '#64748b' }}>PID: {moment.pid || '—'}</span>
                )}

                <button
                  className="rewind-btn"
                  style={{ padding: '5px 12px', fontSize: '0.75rem' }}
                  onClick={(e) => {
                    e.stopPropagation()
                    audioEngine.playWhoosh()
                    onJumpMoment(moment)
                  }}
                >
                  ↶ Jump
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
