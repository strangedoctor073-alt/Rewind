import React from 'react'
import { Handle, Position } from '@xyflow/react'
import type { DashboardMoment } from '../types'

interface MomentNodeProps {
  data: {
    moment: DashboardMoment
    isSelected?: boolean
    onSelect?: (moment: DashboardMoment) => void
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
  const { moment, isSelected, onSelect } = data
  const isNonRestorable = isNonRestorableMoment(moment)

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation()
    onSelect?.(moment)
  }

  return (
    <div
      className={`moment-node ${isSelected ? 'selected' : ''} ${isNonRestorable ? 'non-restorable' : ''}`}
      style={isNonRestorable ? { borderColor: 'rgba(214, 182, 94, 0.45)' } : undefined}
      onClick={() => onSelect?.(moment)}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#69d5a5' }} />

      <div className="moment-node-header">
        <span className="moment-node-badge">{moment.appName}</span>
        {isNonRestorable && (
          <span
            style={{
              fontSize: '0.65rem',
              fontWeight: 600,
              color: '#d6b65e',
              background: 'rgba(214, 182, 94, 0.12)',
              border: '1px solid rgba(214, 182, 94, 0.3)',
              borderRadius: '4px',
              padding: '1px 5px',
              marginLeft: '4px',
              cursor: 'help',
            }}
            title="Recovery classification is based on recorded process metadata; review the restore preview before taking action."
          >
            Recovery uncertain
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
        {moment.screenshotUrl
          ? <img src={moment.screenshotUrl} alt={`Captured window from ${moment.appName}`} />
          : <span>Screenshot preview unavailable</span>}
      </div>
      {moment.ocrText && <div className="moment-node-ocr"><strong>OCR text</strong><span>{moment.ocrText.slice(0, 90)}</span></div>}

      <div className="moment-node-footer">
        {moment.gitBranch && (
          <span style={{ fontSize: '0.7rem', color: '#69d5a5' }}>
            Branch · {moment.gitBranch}
          </span>
        )}
        <button
          className="rewind-btn"
          style={{
            padding: '4px 10px',
            fontSize: '0.72rem',
            marginLeft: 'auto',
            cursor: 'pointer',
          }}
          onClick={handleSelect}
          title="Select this moment in the Graph view"
        >
          Select
        </button>
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: '#69d5a5' }} />
    </div>
  )
}
