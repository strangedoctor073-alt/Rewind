import React, { useMemo, useState } from 'react'
import type { DashboardMoment, TimelineDataStatus } from '../types'
import './timelineView.css'

interface TimelineViewProps {
  moments: DashboardMoment[]
  selectedMomentId: string | null
  dataStatus: TimelineDataStatus
  connectionError?: string | null
  onSelectMoment: (moment: DashboardMoment) => void
}

const formatClock = (timestamp: number) => new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const dayKey = (timestamp: number) => new Date(timestamp).toLocaleDateString()

const statusCopy: Record<TimelineDataStatus, { label: string; detail: string }> = {
  loading: { label: 'Connecting', detail: 'Checking the local activity daemon…' },
  demo: { label: 'Sample timeline', detail: 'These example moments are illustrative, not recorded from this device.' },
  live: { label: 'Live timeline', detail: 'Moments recorded locally by REWIND.' },
  stale: { label: 'Saved timeline · offline', detail: 'Showing the last activity loaded. The daemon is currently unavailable.' },
  empty: { label: 'No activity yet', detail: 'REWIND has not recorded any moments in this timeline.' },
}

export const TimelineView: React.FC<TimelineViewProps> = ({ moments, selectedMomentId, dataStatus, connectionError, onSelectMoment }) => {
  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    const ordered = [...moments].sort((a, b) => b.timestamp - a.timestamp)
    if (!normalized) return ordered
    return ordered.filter((moment) => `${moment.appName} ${moment.windowTitle} ${moment.gitBranch ?? ''}`.toLocaleLowerCase().includes(normalized))
  }, [moments, query])

  const groups = useMemo(() => {
    const result: Array<{ key: string; label: string; moments: DashboardMoment[] }> = []
    for (const moment of filtered) {
      const key = dayKey(moment.timestamp)
      let group = result.at(-1)
      if (!group || group.key !== key) {
        group = { key, label: new Date(moment.timestamp).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }), moments: [] }
        result.push(group)
      }
      group.moments.push(moment)
    }
    return result
  }, [filtered])

  const source = statusCopy[dataStatus]
  const hasRecordedActivity = dataStatus === 'live' || dataStatus === 'stale'

  return (
    <section className="activity-timeline" aria-labelledby="timeline-title">
      <div className="timeline-heading">
        <div>
          <p className="timeline-eyebrow">ACTIVITY HISTORY</p>
          <h1 id="timeline-title">Timeline</h1>
          <p className="timeline-description">Find a moment, understand its context, and choose what to do next.</p>
        </div>
        <label className="timeline-search">
          <span aria-hidden="true">⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search apps and window titles" aria-label="Search activity timeline" />
          {query && <button type="button" onClick={() => setQuery('')} aria-label="Clear timeline search">×</button>}
        </label>
      </div>

      <div className={`timeline-source timeline-source-${dataStatus}`} role="status">
        <span className="timeline-source-dot" aria-hidden="true" />
        <strong>{source.label}</strong>
        <span>{source.detail}</span>
      </div>
      {connectionError && <div className="timeline-error" role="alert">Could not refresh local activity: {connectionError}</div>}

      {dataStatus === 'loading' ? (
        <div className="timeline-empty"><h2>Loading activity</h2><p>{source.detail}</p></div>
      ) : filtered.length === 0 ? (
        <div className="timeline-empty">
          <div className="timeline-empty-mark" aria-hidden="true">↶</div>
          <h2>{query ? 'No matching moments' : dataStatus === 'empty' ? 'Your timeline is ready' : 'No moments to show'}</h2>
          <p>{query ? 'Try a different app name or window title.' : hasRecordedActivity ? 'The selected timeline has no moments.' : source.detail}</p>
        </div>
      ) : (
        <div className="timeline-groups" aria-label="Activity moments grouped by date">
          {groups.map((group) => (
            <section className="timeline-day" key={group.key} aria-label={group.label}>
              <h2 className="timeline-day-heading"><span>{group.label}</span><span>{group.moments.length} {group.moments.length === 1 ? 'moment' : 'moments'}</span></h2>
              <div className="timeline-day-list">
                {group.moments.map((moment) => {
                  const selected = moment.id === selectedMomentId
                  return (
                    <button
                      type="button"
                      key={moment.id}
                      className={`timeline-moment${selected ? ' is-selected' : ''}`}
                      aria-pressed={selected}
                      onClick={() => onSelectMoment(moment)}
                    >
                      <time className="timeline-moment-time" dateTime={new Date(moment.timestamp).toISOString()}>{formatClock(moment.timestamp)}</time>
                      <span className="timeline-moment-marker" aria-hidden="true" />
                      <span className="timeline-moment-copy">
                        <span className="timeline-moment-app">{moment.appName || 'Unknown app'}{moment.gitBranch && <span className="timeline-branch">{moment.gitBranch}</span>}</span>
                        <span className="timeline-moment-title">{moment.windowTitle || 'Untitled window'}</span>
                      </span>
                      <span className="timeline-moment-evidence">
                        {moment.screenshotUrl ? <img src={moment.screenshotUrl} alt="Captured window preview" /> : <span>No preview</span>}
                        {moment.isClosed && <span className="timeline-closed">Closed</span>}
                      </span>
                      <span className="timeline-moment-chevron" aria-hidden="true">›</span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
