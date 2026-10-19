import React, { useMemo, useState } from 'react'
import { audioEngine } from '../../audio/synth'
import type { DashboardMoment } from '../types'

interface FilmstripViewProps {
  moments: DashboardMoment[]
  selectedMomentId?: string
  onSelectMoment: (moment: DashboardMoment) => void
  onJumpMoment: (moment: DashboardMoment) => void
}

function isNonRestorableMoment(moment: DashboardMoment): boolean {
  const name = (moment.appName || '').toLowerCase()
  const title = (moment.windowTitle || '').toLowerCase()
  if (!moment.processPath && !name) return true
  // Internal Windows system components and background shell dialogs
  if (
    name === 'searchapp.exe' ||
    name === 'searchhost.exe' ||
    name === 'shellexperiencehost.exe' ||
    name === 'startmenuexperiencehost.exe' ||
    name === 'lockapp.exe' ||
    name === 'systemsettings.exe' ||
    name === 'taskmgr.exe' ||
    name === 'dwm.exe' ||
    name === 'csrss.exe'
  ) {
    return true
  }
  // Windows Explorer when it's desktop / taskbar / background without folder path
  if (name === 'explorer.exe' && (!title || title === 'program manager' || title === 'taskbar' || title === 'notification chevron' || !moment.processPath)) {
    return true
  }
  return false
}

export const FilmstripView: React.FC<FilmstripViewProps> = ({
  moments,
  selectedMomentId,
  onSelectMoment,
  onJumpMoment,
}) => {
  const [filter, setFilter] = useState<'all' | 'restorable' | 'non-restorable'>('all')

  const restorableMoments = useMemo(
    () => moments.filter((m) => !isNonRestorableMoment(m)),
    [moments]
  )

  const nonRestorableMoments = useMemo(
    () => moments.filter((m) => isNonRestorableMoment(m)),
    [moments]
  )

  const renderCard = (moment: DashboardMoment, idx: number, isNonRestorable: boolean) => {
    const isSelected = moment.id === selectedMomentId
    return (
      <div
        key={moment.id}
        className={`filmstrip-card ${isSelected ? 'active' : ''}`}
        style={
          isNonRestorable
            ? {
                borderColor: isSelected ? '#f59e0b' : 'rgba(245, 158, 11, 0.25)',
                background: 'rgba(22, 19, 13, 0.75)',
              }
            : undefined
        }
        onClick={() => onSelectMoment(moment)}
        onMouseEnter={() => audioEngine.playTick(1.0 + (idx % 5) * 0.1)}
      >
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span
              className="moment-node-badge"
              style={
                isNonRestorable
                  ? {
                      background: 'rgba(245, 158, 11, 0.15)',
                      color: '#fbbf24',
                      borderColor: 'rgba(245, 158, 11, 0.4)',
                    }
                  : undefined
              }
            >
              {moment.appName}
            </span>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              {new Date(moment.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>

          <div
            style={{
              fontSize: '0.88rem',
              fontWeight: 600,
              color: '#fff',
              marginBottom: 10,
              lineHeight: 1.3,
              overflow: 'hidden',
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
            }}
          >
            {moment.windowTitle || '(No window title)'}
          </div>
        </div>

        <div
          style={{
            height: '110px',
            borderRadius: '8px',
            background: 'rgba(0,0,0,0.4)',
            border: `1px solid ${isNonRestorable ? 'rgba(245, 158, 11, 0.15)' : 'rgba(255,255,255,0.06)'}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '10px',
            textAlign: 'center',
            fontSize: '0.75rem',
            color: '#94a3b8',
          }}
        >
          {moment.ocrText ? (
            <span style={{ fontStyle: 'italic', color: '#cbd5e1' }}>"{moment.ocrText.slice(0, 65)}..."</span>
          ) : (
            <span>Window: {moment.bounds?.width || 1280} × {moment.bounds?.height || 720}</span>
          )}

          {isNonRestorable && (
            <div
              style={{
                marginTop: 8,
                fontSize: '0.68rem',
                color: '#fbbf24',
                background: 'rgba(245, 158, 11, 0.12)',
                padding: '2px 8px',
                borderRadius: 4,
              }}
            >
              🔒 System / Non-Relaunchable
            </div>
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
            style={{
              padding: '5px 12px',
              fontSize: '0.75rem',
              opacity: isNonRestorable ? 0.45 : 1,
              cursor: isNonRestorable ? 'not-allowed' : 'pointer',
              borderColor: isNonRestorable ? 'rgba(245, 158, 11, 0.3)' : undefined,
            }}
            disabled={isNonRestorable}
            title={isNonRestorable ? 'Internal system UI component — resurrection disabled' : 'Relaunch application or bring to foreground'}
            onClick={(e) => {
              e.stopPropagation()
              if (isNonRestorable) return
              audioEngine.playWhoosh()
              onJumpMoment(moment)
            }}
          >
            {isNonRestorable ? 'View-Only' : '↶ Jump'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="filmstrip-container" style={{ overflowY: 'auto' }}>
      {/* Header and Filter Buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#fff' }}>Filmstrip Scrubber</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
            Two-tier chronological scrubber separating restorable workspaces from non-restorable system windows.
          </p>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className={`preset-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
            style={filterBtnStyle(filter === 'all')}
          >
            All ({moments.length})
          </button>
          <button
            className={`preset-btn ${filter === 'restorable' ? 'active' : ''}`}
            onClick={() => setFilter('restorable')}
            style={filterBtnStyle(filter === 'restorable', '#00f0ff')}
          >
            ⚡ Restorable ({restorableMoments.length})
          </button>
          <button
            className={`preset-btn ${filter === 'non-restorable' ? 'active' : ''}`}
            onClick={() => setFilter('non-restorable')}
            style={filterBtnStyle(filter === 'non-restorable', '#fbbf24')}
          >
            🔒 Non-Restorable ({nonRestorableMoments.length})
          </button>
        </div>
      </div>

      {/* Row 1: Restorable Applications */}
      {(filter === 'all' || filter === 'restorable') && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#00f0ff', letterSpacing: '0.05em' }}>
              ⚡ RESTORABLE & RELAUNCHABLE APPLICATIONS ({restorableMoments.length})
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              — Active terminals, IDEs, browsers, and applications ready for 1-click relaunch
            </span>
          </div>

          {restorableMoments.length === 0 ? (
            <div style={emptyRowStyle}>No restorable application moments recorded.</div>
          ) : (
            <div className="filmstrip-scroll">
              {restorableMoments.map((moment, idx) => renderCard(moment, idx, false))}
            </div>
          )}
        </div>
      )}

      {/* Row 2: Non-Restorable & System Windows */}
      {(filter === 'all' || filter === 'non-restorable') && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fbbf24', letterSpacing: '0.05em' }}>
              🔒 NON-RESTORABLE & VIEW-ONLY WINDOWS ({nonRestorableMoments.length})
            </span>
            <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
              — Internal OS shell components, background hosts, or windows without relaunch paths
            </span>
          </div>

          {nonRestorableMoments.length === 0 ? (
            <div style={emptyRowStyle}>No non-restorable system moments found.</div>
          ) : (
            <div className="filmstrip-scroll">
              {nonRestorableMoments.map((moment, idx) => renderCard(moment, idx, true))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function filterBtnStyle(isActive: boolean, activeColor = '#00f0ff'): React.CSSProperties {
  return {
    padding: '6px 14px',
    borderRadius: '20px',
    background: isActive ? 'rgba(15, 23, 42, 0.95)' : 'rgba(30, 41, 59, 0.6)',
    border: `1px solid ${isActive ? activeColor : 'rgba(148, 163, 184, 0.2)'}`,
    color: isActive ? activeColor : '#94a3b8',
    fontSize: '0.75rem',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  }
}

const emptyRowStyle: React.CSSProperties = {
  padding: '24px',
  textAlign: 'center',
  color: '#64748b',
  fontSize: '0.8rem',
  background: 'rgba(0, 0, 0, 0.2)',
  borderRadius: '8px',
  border: '1px dashed rgba(255, 255, 255, 0.08)',
}
