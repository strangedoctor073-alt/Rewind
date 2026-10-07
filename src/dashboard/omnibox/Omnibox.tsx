import React, { useState } from 'react'
import { audioEngine } from '../../audio/synth'
import type { DashboardMoment } from '../types'

interface OmniboxProps {
  isOpen: boolean
  moments: DashboardMoment[]
  onClose: () => void
  onSelectMoment: (moment: DashboardMoment) => void
  onToggleSound: () => void
}

export const Omnibox: React.FC<OmniboxProps> = ({
  isOpen,
  moments,
  onClose,
  onSelectMoment,
  onToggleSound,
}) => {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const handleClose = () => {
    setQuery('')
    setSelectedIndex(0)
    onClose()
  }

  if (!isOpen) return null

  const filteredMoments = moments.filter(
    (m) =>
      m.windowTitle.toLowerCase().includes(query.toLowerCase()) ||
      m.appName.toLowerCase().includes(query.toLowerCase()) ||
      (m.ocrText && m.ocrText.toLowerCase().includes(query.toLowerCase()))
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      handleClose()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      audioEngine.playTick(1.3)
      setSelectedIndex((prev) => Math.min(prev + 1, Math.max(0, filteredMoments.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      audioEngine.playTick(0.9)
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      if (filteredMoments[selectedIndex]) {
        audioEngine.playWhoosh()
        onSelectMoment(filteredMoments[selectedIndex])
        handleClose()
      }
    }
  }

  return (
    <div className="omnibox-overlay" onClick={handleClose}>
      <div className="omnibox-card" onClick={(e) => e.stopPropagation()}>
        <div className="omnibox-input-wrapper">
          <span style={{ fontSize: '1.2rem', color: '#00f0ff' }}>🔍</span>
          <input
            autoFocus
            type="text"
            className="omnibox-input"
            placeholder="Search windows, apps, OCR text, or type '>' for actions..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            onKeyDown={handleKeyDown}
          />
          <span style={{ fontSize: '0.75rem', color: '#64748b', background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: 4 }}>
            ESC to close
          </span>
        </div>

        <div className="omnibox-results">
          {filteredMoments.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '0.85rem' }}>
              No matching moments found for "{query}".
            </div>
          ) : (
            filteredMoments.slice(0, 8).map((moment, idx) => (
              <div
                key={moment.id}
                className={`omnibox-item ${idx === selectedIndex ? 'active' : ''}`}
                onClick={() => {
                  audioEngine.playWhoosh()
                  onSelectMoment(moment)
                  onClose()
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                <div>
                  <div style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 600 }}>
                    {moment.windowTitle}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    {moment.appName} • {new Date(moment.timestamp).toLocaleTimeString()}
                  </div>
                </div>
                <span className="moment-node-badge">{moment.appName}</span>
              </div>
            ))
          )}

          {/* Action shortcut row */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8' }}>
            <span>Action: Press <strong>Enter</strong> to jump</span>
            <span
              style={{ cursor: 'pointer', color: '#00f0ff' }}
              onClick={() => {
                onToggleSound()
                audioEngine.playTick(1.5)
              }}
            >
              🔊 Toggle Sound Synth
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
