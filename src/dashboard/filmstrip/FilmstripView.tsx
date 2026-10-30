import React, { useMemo, useState } from 'react'
import type { DashboardMoment } from '../types'

interface FilmstripViewProps {
  moments: DashboardMoment[]
  selectedMomentId?: string
  onSelectMoment: (moment: DashboardMoment) => void
  onShowInGraph: (moment: DashboardMoment) => void
}

type MomentFilter = 'all' | 'recovery-candidates' | 'system'

function isSystemOrUnavailable(moment: DashboardMoment): boolean {
  const name = (moment.appName || '').toLowerCase()
  const title = (moment.windowTitle || '').toLowerCase()
  if (!moment.processPath && !name) return true
  if (['searchapp.exe', 'searchhost.exe', 'shellexperiencehost.exe', 'startmenuexperiencehost.exe', 'lockapp.exe', 'systemsettings.exe', 'taskmgr.exe', 'dwm.exe', 'csrss.exe'].includes(name)) return true
  return name === 'explorer.exe' && (!title || title === 'program manager' || title === 'taskbar' || title === 'notification chevron' || !moment.processPath)
}

function FilmstripCard({
  moment,
  selected,
  systemWindow,
  onSelect,
  onShowInGraph,
}: {
  moment: DashboardMoment
  selected: boolean
  systemWindow: boolean
  onSelect: () => void
  onShowInGraph: () => void
}) {
  return (
    <article className={`filmstrip-card${selected ? ' active' : ''}`}>
      <button type="button" className="filmstrip-select" aria-pressed={selected} onClick={onSelect}>
        <span className="filmstrip-card-head">
          <span className="moment-node-badge">{moment.appName || 'Unknown app'}</span>
          <time dateTime={new Date(moment.timestamp).toISOString()}>{new Date(moment.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        </span>
        <span className="filmstrip-card-title">{moment.windowTitle || 'Untitled window'}</span>
        <span className="filmstrip-evidence">
          {moment.screenshotUrl
            ? <img src={moment.screenshotUrl} alt={`Captured window from ${moment.appName}`} />
            : <span>Screenshot preview unavailable</span>}
        </span>
        {moment.ocrText && <span className="filmstrip-ocr"><strong>OCR text</strong><span>{moment.ocrText.slice(0, 90)}</span></span>}
        {systemWindow && <span className="filmstrip-recovery-note">System window · recovery unavailable</span>}
      </button>
      <div className="filmstrip-card-footer">
        <span>{moment.gitBranch ? `Branch · ${moment.gitBranch}` : moment.pid ? `Process · ${moment.pid}` : 'Local activity'}</span>
        <button type="button" className="rewind-btn" onClick={onShowInGraph} title="Show this moment in the Graph view">Show in Graph</button>
      </div>
    </article>
  )
}

export const FilmstripView: React.FC<FilmstripViewProps> = ({ moments, selectedMomentId, onSelectMoment, onShowInGraph }) => {
  const [filter, setFilter] = useState<MomentFilter>('all')
  const recoveryCandidates = useMemo(() => moments.filter((moment) => !isSystemOrUnavailable(moment)), [moments])
  const systemMoments = useMemo(() => moments.filter(isSystemOrUnavailable), [moments])

  const sections = [
    ...(filter === 'all' || filter === 'recovery-candidates' ? [{ key: 'recovery', title: 'Recovery candidates', note: 'Heuristic grouping only. Preview the workspace restore report before launching anything.', items: recoveryCandidates, systemWindow: false }] : []),
    ...(filter === 'all' || filter === 'system' ? [{ key: 'system', title: 'System and view-only moments', note: 'These windows are excluded from the recovery-candidate group.', items: systemMoments, systemWindow: true }] : []),
  ]

  return (
    <section className="filmstrip-container" aria-labelledby="filmstrip-title">
      <header className="filmstrip-page-head">
        <div>
          <p className="timeline-eyebrow">ALTERNATIVE VIEW</p>
          <h1 id="filmstrip-title">Filmstrip</h1>
          <p>Browse moments visually. A preview appears only when an actual screenshot is available.</p>
        </div>
        <div className="filmstrip-filters" role="group" aria-label="Filter Filmstrip moments">
          {([
            ['all', `All · ${moments.length}`],
            ['recovery-candidates', `Recovery candidates · ${recoveryCandidates.length}`],
            ['system', `System · ${systemMoments.length}`],
          ] as const).map(([value, label]) => (
            <button type="button" key={value} className={`preset-btn${filter === value ? ' active' : ''}`} aria-pressed={filter === value} onClick={() => setFilter(value)}>{label}</button>
          ))}
        </div>
      </header>

      <div className="filmstrip-sections">
        {sections.map((section) => (
          <section className="filmstrip-section" key={section.key} aria-labelledby={`filmstrip-${section.key}`}>
            <div className="filmstrip-section-head">
              <h2 id={`filmstrip-${section.key}`}>{section.title}<span>{section.items.length}</span></h2>
              <p>{section.note}</p>
            </div>
            {section.items.length === 0
              ? <p className="filmstrip-empty">No moments in this group.</p>
              : <div className="filmstrip-scroll">
                {section.items.map((moment) => (
                  <FilmstripCard
                    key={moment.id}
                    moment={moment}
                    selected={moment.id === selectedMomentId}
                    systemWindow={section.systemWindow}
                    onSelect={() => onSelectMoment(moment)}
                    onShowInGraph={() => onShowInGraph(moment)}
                  />
                ))}
              </div>}
          </section>
        ))}
      </div>
    </section>
  )
}
