import React from 'react'
import { Handle, Position } from '@xyflow/react'
import { audioEngine } from '../../audio/synth'

interface ClusterNodeProps {
  data: {
    label: string
    timeRange: string
    apps: string[]
    momentCount: number
    onDrillDown?: () => void
  }
}

export const ClusterNode: React.FC<ClusterNodeProps> = ({ data }) => {
  const { label, timeRange, apps, momentCount, onDrillDown } = data

  const handleMouseEnter = () => {
    audioEngine.playTick(0.8)
  }

  return (
    <div className="cluster-node" onMouseEnter={handleMouseEnter}>
      <Handle type="target" position={Position.Top} style={{ background: '#10b981' }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: '0.75rem', color: '#10b981', fontWeight: 700 }}>
          ⚡ SESSION CLUSTER (LOD 1)
        </span>
        <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{timeRange}</span>
      </div>

      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', marginBottom: 6 }}>
        {label}
      </div>

      <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginBottom: 12 }}>
        {momentCount} moments across {apps.join(', ')}
      </div>

      <button
        className="rewind-btn rewind-btn-primary"
        style={{ width: '100%', justifyContent: 'center' }}
        onClick={() => {
          audioEngine.playWhoosh()
          onDrillDown?.()
        }}
      >
        🔍 Drill Down to Task Flow (LOD 2)
      </button>

      <Handle type="source" position={Position.Bottom} style={{ background: '#10b981' }} />
    </div>
  )
}
