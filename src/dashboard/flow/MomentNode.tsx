import React from 'react'
import { Handle, Position } from '@xyflow/react'
import { audioEngine } from '../../audio/synth'
import type { DashboardMoment } from '../types'

interface MomentNodeProps {
  data: {
    moment: DashboardMoment
    isSelected?: boolean
    onSelect?: (moment: DashboardMoment) => void
    onJump?: (moment: DashboardMoment) => void
  }
}

const isNonRestorableMoment = (moment: DashboardMoment): boolean => {
  const name = moment.appName?.toLowerCase() || ''
  if (!moment.processPath && !name) return true
  if (name === 'searchapp.exe' || name === 'shellexperiencehost.exe' || name === 'startmenuexperiencehost.exe') {
    return true
  }
  return false
}

export const MomentNode: React.FC<MomentNodeProps> = ({ data }) => {
  const { moment, isSelected, onSelect, onJump } = data
  const isNonRestorable = isNonRestorableMoment(moment)

  const handleMouseEnter = () => {
    audioEngine.playTick(1.2)
  }

  const handleJump = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isNonRestorable) return
    audioEngine.playWhoosh()
    if (onJump) onJump(moment)
  }

  return (
    <div
      className={`moment-node ${isSelected ? 'selected' : ''} ${isNonRestorable ? 'non-restorable' : ''}`}
      style={isNonRestorable ? { borderColor: 'rgba(251, 191, 36, 0.45)', opacity: 0.82 } : undefined}
      onClick={() => onSelect?.(moment)}
      onMouseEnter={handleMouseEnter}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#00f0ff' }} />

      <div className="moment-node-header">
        <span className="moment-node-badge">{moment.appName}</span>
        {isNonRestorable && (
          <span
            style={{
              fontSize: '0.65rem',
              fontWeight: 600,
              color: '#fbbf24',
              background: 'rgba(251, 191, 36, 0.15)',
              border: '1px solid rgba(251, 191, 36, 0.3)',
              borderRadius: '4px',
              padding: '1px 5px',
              marginLeft: '4px',
              cursor: 'help',
            }}
            title="System component or missing executable — resurrection disabled."
          >
            🛡️ Non-Restorable
          </span>
        )}
        <span className="moment-node-time" style={{ marginLeft: 'auto' }}>
          {new Date(moment.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </div>

      <div className="moment-node-title" title={moment.windowTitle}>
        {moment.windowTitle}
      </div>

      <div className="moment-node-preview">
        {moment.ocrText ? (
          <span style={{ padding: '0 8px', textAlign: 'center', opacity: 0.85 }}>
            "{moment.ocrText.slice(0, 50)}..."
          </span>
        ) : (
          <span>Geometry: {moment.bounds?.width || 1280} × {moment.bounds?.height || 720}</span>
        )}
      </div>

      <div className="moment-node-footer">
        {moment.gitBranch && (
          <span style={{ fontSize: '0.7rem', color: '#00f0ff' }}>
            🌿 {moment.gitBranch}
          </span>
        )}
        <button
          className="rewind-btn"
          style={{
            padding: '4px 10px',
            fontSize: '0.72rem',
            marginLeft: 'auto',
            opacity: isNonRestorable ? 0.4 : 1,
            cursor: isNonRestorable ? 'not-allowed' : 'pointer',
          }}
          onClick={handleJump}
          disabled={isNonRestorable}
          title={isNonRestorable ? 'Internal system UI component — resurrection disabled' : 'Relaunch application or bring to foreground'}
        >
          ↶ Jump
        </button>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: '#00f0ff' }} />
    </div>
  )
}
