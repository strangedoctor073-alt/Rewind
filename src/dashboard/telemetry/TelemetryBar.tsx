import React from 'react'
import type { TelemetryStats, TimelineDataStatus } from '../types'

interface TelemetryBarProps {
  stats: TelemetryStats | null
  dataStatus: TimelineDataStatus
}

const sourceLabel: Record<TimelineDataStatus, string> = {
  loading: 'Checking local daemon',
  demo: 'Example data · not recorded',
  live: 'Local recording active',
  stale: 'Offline · showing last loaded data',
  empty: 'No recorded moments',
}

export const TelemetryBar: React.FC<TelemetryBarProps> = ({ stats, dataStatus }) => (
  <footer className="gd-footer" aria-label="Activity data status">
    <span className={`gd-footer-source gd-footer-${dataStatus}`}>
      <span aria-hidden="true" />
      {sourceLabel[dataStatus]}
    </span>
    {stats ? (
      <div className="gd-footer-metrics" aria-label={dataStatus === 'stale' ? 'Last known analytics' : 'Current analytics'}>
        {dataStatus === 'stale' && <span>Last known</span>}
        <span>Focus <strong>{stats.focusScore}%</strong></span>
        <span>Switches <strong>{stats.contextSwitchesPerHour}/hr</strong></span>
        <span>Moments <strong>{stats.momentsRecorded}</strong></span>
      </div>
    ) : (
      <span className="gd-footer-unavailable">Live analytics unavailable</span>
    )}
  </footer>
)
