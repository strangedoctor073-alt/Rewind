import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { clearHistory, deleteRecording, getRecording, listRecordings, rewindTo } from './messages'
import type { BrowserRecording, BrowserRecordingEvent, RecordingSummary } from './types'

const formatTime = (milliseconds: number) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000))
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const seconds = (totalSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

const byteSize = (value: unknown) => new Blob([JSON.stringify(value)]).size

const hostFor = (url?: string) => {
  try {
    return url ? new URL(url).hostname : 'this page'
  } catch {
    return 'this page'
  }
}

type EventKindFilter = 'all' | 'click' | 'type' | 'scroll'

function Timeline() {
  const [recordings, setRecordings] = useState<RecordingSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedRecording, setSelectedRecording] = useState<BrowserRecording | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [kindFilter, setKindFilter] = useState<EventKindFilter>('all')
  const [notice, setNotice] = useState<string | null>(null)
  const [copiedSelector, setCopiedSelector] = useState(false)
  const [busy, setBusy] = useState(false)
  const selectedIdRef = useRef<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const noticeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    selectedIdRef.current = selectedId
  }, [selectedId])

  const showToast = useCallback((message: string) => {
    setNotice(message)
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current)
    noticeTimerRef.current = window.setTimeout(() => setNotice(null), 4000)
  }, [])

  const selectRecording = useCallback((id: string | null) => {
    selectedIdRef.current = id
    setSelectedId(id)
    setSelectedEventId(null)
    if (!id) setSelectedRecording(null)
  }, [])

  const loadIndex = useCallback(async () => {
    try {
      const list = await listRecordings()
      setRecordings(list)
      if (!selectedIdRef.current && list[0]) selectRecording(list[0].id)
      if (selectedIdRef.current && !list.some((item) => item.id === selectedIdRef.current)) {
        selectRecording(list[0]?.id ?? null)
      }
    } catch {
      showToast('Could not reach the REWIND background service.')
    }
  }, [selectRecording, showToast])

  const loadSelected = useCallback(async (id: string) => {
    try {
      const full = await getRecording(id)
      if (selectedIdRef.current === id) setSelectedRecording(full)
    } catch {
      showToast('Could not refresh this browser recording.')
    }
  }, [showToast])

  // Refresh only when the extension's recording index or selected recording changes.
  useEffect(() => {
    const onChanged = (changes: Record<string, { oldValue?: unknown; newValue?: unknown }>, areaName: string) => {
      if (areaName !== 'local') return
      if (changes['rewind:index']) void loadIndex()
      const id = selectedIdRef.current
      if (id && changes[`rewind:recording:${id}`]) void loadSelected(id)
    }
    const initialLoad = window.setTimeout(() => { void loadIndex() }, 0)
    chrome.storage.onChanged.addListener(onChanged)
    return () => {
      window.clearTimeout(initialLoad)
      chrome.storage.onChanged.removeListener(onChanged)
    }
  }, [loadIndex, loadSelected])

  useEffect(() => {
    if (!selectedId) return undefined
    const initialLoad = window.setTimeout(() => { void loadSelected(selectedId) }, 0)
    return () => window.clearTimeout(initialLoad)
  }, [selectedId, loadSelected])

  useEffect(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current)
  }, [])

  const events = useMemo(() => selectedRecording?.events ?? [], [selectedRecording])

  const filteredRecordings = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return recordings
    return recordings.filter(
      (item) => item.title.toLowerCase().includes(q) || item.host.toLowerCase().includes(q)
    )
  }, [recordings, searchQuery])

  const filteredEvents = useMemo(() => {
    if (kindFilter === 'all') return events
    return events.filter((e) => e.kind === kindFilter)
  }, [events, kindFilter])

  const selectedEvent: BrowserRecordingEvent | null =
    filteredEvents.find((event) => event.id === selectedEventId) ??
    events.find((event) => event.id === selectedEventId) ??
    filteredEvents.at(-1) ??
    null

  const selectedEventIndex = selectedEvent ? filteredEvents.findIndex((e) => e.id === selectedEvent.id) : -1

  const handleDelete = async (event: ReactMouseEvent, id: string) => {
    event.stopPropagation()
    try {
      await deleteRecording(id)
      const list = await listRecordings()
      setRecordings(list)
      showToast('Recording deleted from history.')
      if (id === selectedId) selectRecording(list[0]?.id ?? null)
    } catch (error) {
      showToast(error instanceof Error ? `Could not delete recording: ${error.message}` : 'Could not delete recording.')
    }
  }

  const handleClear = async () => {
    if (!window.confirm('Clear every recording saved in this extension? This cannot be undone.')) return
    try {
      await clearHistory()
      setRecordings([])
      selectRecording(null)
      showToast('All recording history cleared.')
    } catch (error) {
      showToast(error instanceof Error ? `Could not clear history: ${error.message}` : 'Could not clear history.')
    }
  }

  const handleExport = () => {
    if (!selectedRecording) return
    const blob = new Blob([JSON.stringify(selectedRecording, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(selectedRecording.title || 'rewind-recording')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'rewind-recording'}.rewind.json`
    link.click()
    URL.revokeObjectURL(url)
    showToast('Exported recording as portable .rewind.json backup.')
  }

  const copySelector = useCallback(() => {
    if (!selectedEvent?.target) return
    navigator.clipboard.writeText(selectedEvent.target).then(() => {
      setCopiedSelector(true)
      showToast(`Copied selector "${selectedEvent.target}" to clipboard`)
      setTimeout(() => setCopiedSelector(false), 2000)
    }).catch(() => showToast('Could not access the clipboard.'))
  }, [selectedEvent, showToast])

  const handleRewind = useCallback(async () => {
    if (!selectedRecording || !selectedEvent) return
    setBusy(true)
    try {
      const result = await rewindTo(selectedRecording.id, selectedEvent.id)
      showToast(result.note ?? `Focused ${hostFor(selectedEvent.url)} and restored scroll position.`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not rewind to that point.')
    } finally {
      setBusy(false)
    }
  }, [selectedRecording, selectedEvent, showToast])

  // Keyboard navigation
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isInput = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement
      if (e.key === '/' && !isInput) {
        e.preventDefault()
        searchInputRef.current?.focus()
        return
      }
      if (isInput) {
        if (e.key === 'Escape') searchInputRef.current?.blur()
        return
      }

      if ((e.key === 'ArrowDown' || e.key === 'j') && filteredEvents.length > 0) {
        e.preventDefault()
        const nextIndex = selectedEventIndex < filteredEvents.length - 1 ? selectedEventIndex + 1 : 0
        setSelectedEventId(filteredEvents[nextIndex].id)
      } else if ((e.key === 'ArrowUp' || e.key === 'k') && filteredEvents.length > 0) {
        e.preventDefault()
        const prevIndex = selectedEventIndex > 0 ? selectedEventIndex - 1 : filteredEvents.length - 1
        setSelectedEventId(filteredEvents[prevIndex].id)
      } else if (e.key === 'Enter' && selectedEvent) {
        e.preventDefault()
        void handleRewind()
      } else if (e.key.toLowerCase() === 'c' && selectedEvent) {
        copySelector()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filteredEvents, selectedEventIndex, selectedEvent, handleRewind, copySelector])

  return (
    <main className="timeline-shell">
      <header className="timeline-top">
        <div className="brand-group">
          <span className="brand">
            <span className="brand-mark">R</span>
            REWIND
          </span>
          <span className="timeline-subtitle">Local-first Browser Interaction Timeline</span>
        </div>
        <div className="top-actions">
          <span className="stat-pill">{recordings.length} session{recordings.length === 1 ? '' : 's'} saved</span>
          {recordings.length > 0 && (
            <button className="btn-link" onClick={handleClear}>
              Clear history
            </button>
          )}
        </div>
      </header>

      {notice && (
        <aside className="notice-bar" role="status">
          <span>{notice}</span>
          <button className="notice-close" onClick={() => setNotice(null)} aria-label="Dismiss notice">×</button>
        </aside>
      )}

      <div className="timeline-body">
        {/* Left column: History sessions */}
        <aside className="history-list">
          <div className="search-box">
            <input
              ref={searchInputRef}
              id="timeline-search"
              type="text"
              placeholder="Search sessions (/)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search recordings"
            />
            {searchQuery && (
              <button className="search-clear" onClick={() => setSearchQuery('')} aria-label="Clear search">×</button>
            )}
          </div>

          <div className="sessions-scroll">
            {filteredRecordings.length === 0 && (
              <p className="empty-hint">
                {recordings.length === 0
                  ? 'No recordings yet. Open the REWIND popup on any website to begin.'
                  : 'No recordings match your search.'}
              </p>
            )}

            {filteredRecordings.map((item) => (
              <div key={item.id} className="history-row-wrap">
                <button
                  type="button"
                  className={item.id === selectedId ? 'history-row history-row-active' : 'history-row'}
                  aria-pressed={item.id === selectedId}
                  onClick={() => selectRecording(item.id)}
                >
                  <div className="row-main">
                    {item.active && <i className="live-dot" title="Actively recording" />}
                    <span className="history-row-title">{item.title}</span>
                  </div>
                  <div className="row-sub">
                    <span className="row-host">{item.host || 'unknown site'}</span>
                    <span>{item.eventCount} events</span>
                    <span>{formatTime(item.duration)}</span>
                  </div>
                </button>
                <button type="button" aria-label={`Delete ${item.title}`} title={`Delete ${item.title}`} className="delete-x" onClick={(event) => void handleDelete(event, item.id)}>×</button>
              </div>
            ))}
          </div>
        </aside>

        {/* Center column: Events stream */}
        <section className="history-detail">
          {!selectedRecording && (
            <div className="empty-state">
              <span className="empty-icon">⏮</span>
              <h3>No recording selected</h3>
              <p>Select a recording session from the history list to inspect events and rewind.</p>
            </div>
          )}

          {selectedRecording && (
            <>
              <div className="detail-head">
                <div className="detail-title-col">
                  <h2>{selectedRecording.title}</h2>
                  <div className="detail-meta">
                    <span className="meta-item meta-host">{hostFor(selectedRecording.source?.url)}</span>
                    <span className="meta-sep">•</span>
                    <span className="meta-item">{events.length} events total</span>
                    <span className="meta-sep">•</span>
                    <span className="meta-item">{formatTime(selectedRecording.duration)}</span>
                    {selectedRecording.active && <span className="meta-recording-badge">Live Recording</span>}
                  </div>
                </div>
                <button className="btn-secondary" onClick={handleExport}>
                  Export JSON
                </button>
              </div>

              {/* Event filter tabs */}
              <div className="event-filters">
                {(['all', 'click', 'type', 'scroll'] as EventKindFilter[]).map((kind) => {
                  const count = kind === 'all' ? events.length : events.filter((e) => e.kind === kind).length
                  return (
                    <button
                      key={kind}
                      className={kindFilter === kind ? 'filter-tab active' : 'filter-tab'}
                      onClick={() => setKindFilter(kind)}
                    >
                      {kind.charAt(0).toUpperCase() + kind.slice(1)}
                      <span className="filter-count">{count}</span>
                    </button>
                  )
                })}
              </div>

              <div className="event-list" role="list">
                {filteredEvents.length === 0 && (
                  <p className="empty-hint">No events match the selected "{kindFilter}" filter.</p>
                )}
                {filteredEvents.map((event) => {
                  const isSelected = event.id === selectedEvent?.id
                  return (
                    <button
                      key={event.id}
                      className={isSelected ? 'event selected-event' : 'event'}
                      onClick={() => setSelectedEventId(event.id)}
                    >
                      <span className={`event-badge badge-${event.kind}`}>{event.kind.toUpperCase()}</span>
                      <span className="event-content">
                        <strong className="event-label">{event.label}</strong>
                        <small className="event-desc">{event.description}</small>
                      </span>
                      <time className="event-time">{formatTime(event.timestamp)}</time>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </section>

        {/* Right column: Inspector & Actions */}
        <aside className="inspector">
          {!selectedEvent && (
            <div className="empty-state">
              <span className="empty-icon">🔍</span>
              <h3>No event selected</h3>
              <p>Pick an event from the center list or use Arrow keys to inspect parameters.</p>
            </div>
          )}

          {selectedEvent && (
            <>
              <div className="inspector-head">
                <span className="eyebrow">EVENT INSPECTOR</span>
                <h3>{selectedEvent.label}</h3>
              </div>

              <dl className="inspector-grid">
                <div>
                  <dt>Event type</dt>
                  <dd>
                    <span className={`event-badge badge-${selectedEvent.kind}`}>{selectedEvent.kind.toUpperCase()}</span>
                  </dd>
                </div>
                <div>
                  <dt>Target element</dt>
                  <dd className="selector-row">
                    <span className="mono" title={selectedEvent.target}>{selectedEvent.target}</span>
                    <button className="copy-btn" onClick={copySelector} title="Copy CSS selector (press 'c')">
                      {copiedSelector ? 'Copied!' : 'Copy'}
                    </button>
                  </dd>
                </div>
                <div>
                  <dt>Page URL</dt>
                  <dd className="mono host-text">{hostFor(selectedEvent.url)}</dd>
                </div>
                <div>
                  <dt>Scroll position</dt>
                  <dd className="mono">{typeof selectedEvent.scrollY === 'number' ? `${selectedEvent.scrollY}px` : '—'}</dd>
                </div>
                <div>
                  <dt>Value</dt>
                  <dd className="mono">
                    {selectedEvent.masked ? <span className="masked-pill">Masked</span> : selectedEvent.value ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt>Payload size</dt>
                  <dd className="mono">{byteSize(selectedEvent)} bytes</dd>
                </div>
              </dl>

              <div className="inspector-info">
                <small>
                  ↶ <strong>Rewind</strong> will find or open the target tab and restore the exact scroll depth.
                </small>
              </div>

              <div className="inspector-actions">
                <button className="btn-primary" disabled={busy} onClick={() => void handleRewind()}>
                  ↶ Rewind to this moment
                </button>
                <div className="keyboard-hints">
                  <span><kbd>j</kbd>/<kbd>k</kbd> navigate</span>
                  <span><kbd>Enter</kbd> rewind</span>
                  <span><kbd>c</kbd> copy</span>
                </div>
              </div>
            </>
          )}
        </aside>
      </div>
    </main>
  )
}

export default Timeline
