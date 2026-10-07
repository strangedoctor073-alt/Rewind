import React from 'react'
import type { TelemetryStats } from '../types'

interface TelemetryBarProps {
  stats: TelemetryStats
}

export const TelemetryBar: React.FC<TelemetryBarProps> = ({ stats }) => {
  return (
    <footer className="gd-footer">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 8px #10b981',
            }}
          />
          Local Daemon: Active
        </span>

        <span>
          Focus Score:{' '}
          <strong style={{ color: stats.focusScore > 80 ? '#10b981' : '#f59e0b' }}>
            {stats.focusScore}%
          </strong>
        </span>

        <span>
          Context Switches:{' '}
          <strong style={{ color: '#00f0ff' }}>
            {stats.contextSwitchesPerHour}/hr
          </strong>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span>
          Moments: <strong style={{ color: '#fff' }}>{stats.momentsRecorded}</strong>
        </span>

        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: stats.walStatus === 'clean' ? '#10b981' : '#00f0ff',
            }}
          />
          20s WAL: {stats.walStatus.toUpperCase()}
        </span>
      </div>
    </footer>
  )
}
