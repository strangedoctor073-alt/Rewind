import React from 'react'
import { Handle, Position } from '@xyflow/react'
import { audioEngine } from '../../audio/synth'

export interface SessionSeparatorData {
  sessionId: string
  label: string
  timestamp: number
  momentCount: number
  isCollapsed: boolean
  onToggleCollapse: (sessionId: string) => void
}

interface SessionSeparatorNodeProps {
  data: SessionSeparatorData
}

export const SessionSeparatorNode: React.FC<SessionSeparatorNodeProps> = ({ data }) => {
  const { sessionId, label, momentCount, isCollapsed, onToggleCollapse } = data

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    audioEngine.playTick(1.3)
    onToggleCollapse(sessionId)
  }

  return (
    <div
      className="session-separator-node"
      style={{
        padding: '10px 18px',
        background: 'rgba(15, 23, 42, 0.85)',
        border: '1px solid rgba(0, 240, 255, 0.3)',
        borderRadius: '24px',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.4), 0 0 15px rgba(0, 240, 255, 0.1)',
        minWidth: '280px',
        userSelect: 'none',
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: '#00f0ff' }} />

      <div
        style={{
          width: '28px',
          height: '28px',
          borderRadius: '50%',
          background: 'rgba(0, 240, 255, 0.15)',
          border: '1px solid #00f0ff',
          display: 'grid',
          placeItems: 'center',
          color: '#00f0ff',
          fontSize: '13px',
          flexShrink: 0,
        }}
      >
        ⏳
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: '#f8fafc', letterSpacing: '0.5px' }}>
          {label}
        </div>
        <div style={{ fontSize: '10px', color: '#94a3b8' }}>
          {momentCount} {momentCount === 1 ? 'moment' : 'moments'} captured
        </div>
      </div>

      <button
        onClick={handleToggle}
        className="rewind-btn"
        style={{
          padding: '4px 10px',
          fontSize: '10.5px',
          fontWeight: 600,
          background: isCollapsed ? 'rgba(0, 240, 255, 0.18)' : 'rgba(255, 255, 255, 0.08)',
          borderColor: isCollapsed ? '#00f0ff' : 'rgba(255, 255, 255, 0.15)',
          color: isCollapsed ? '#00f0ff' : '#cbd5e1',
          cursor: 'pointer',
        }}
        title={isCollapsed ? 'Expand previous session moments' : 'Collapse previous session moments to declutter canvas'}
      >
        {isCollapsed ? '▶ Expand' : '▼ Collapse'}
      </button>

      <Handle type="source" position={Position.Bottom} style={{ background: '#00f0ff' }} />
    </div>
  )
}
