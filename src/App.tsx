import { useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react'
import { demoRecording } from './data/demoRecording'
import { InPageRecorder } from './recorder/inPageRecorder'
import { clearAllRecordings, deleteRecording, getAllRecordings, saveRecording } from './storage/recordingStore'
import type { Recording, RecordingEvent, ReplaySnapshot } from './types/recording'
import './App.css'
import './recorder.css'
import './final.css'

const initialSnapshot: ReplaySnapshot = { selectedSize: '10', promoCode: '', bagCount: 2, message: 'Ready to explore', scrollY: 0 }
const lastSessionKey = 'rewind:last-session-id'
const formatTime = (milliseconds: number) => `00:${Math.floor(milliseconds / 1000).toString().padStart(2, '0')}`
const byteSize = (value: unknown) => new Blob([JSON.stringify(value)]).size

function snapshotFor(event: RecordingEvent, previous: ReplaySnapshot): ReplaySnapshot {
  if (event.target.startsWith('size:')) {
    const selectedSize = event.target.split(':')[1]
    return { ...previous, selectedSize, message: `Size ${selectedSize} selected` }
  }
  if (event.target === 'promo-code') return { ...previous, promoCode: event.value ?? '', message: event.value ? 'Promo code entered' : 'Promo code cleared' }
  if (event.target === 'add-to-bag') return { ...previous, bagCount: previous.bagCount + 1, message: `Everyday Runner added to bag` }
  if (event.target === 'page-scroll') return { ...previous, scrollY: Number(event.value ?? previous.scrollY ?? 0), message: `Scrolled to ${event.value ?? 0}px` }
  return { ...previous, message: event.label }
}

import { isValidRecording } from './utils/validation'

function App() {
  const [events, setEvents] = useState<RecordingEvent[]>(demoRecording.events)
  const [currentTime, setCurrentTime] = useState(demoRecording.duration)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [title, setTitle] = useState(demoRecording.title)
  const [sessionId, setSessionId] = useState(demoRecording.id)
  const [createdAt, setCreatedAt] = useState(demoRecording.createdAt)
  const [liveSnapshot, setLiveSnapshot] = useState<ReplaySnapshot>(initialSnapshot)
  const [redoStack, setRedoStack] = useState<RecordingEvent[]>([])
  const [notice, setNotice] = useState('Local session / Autosaved')
  const [hydrated, setHydrated] = useState(false)
  const [savedRecordings, setSavedRecordings] = useState<Recording[]>([])
  const [speed, setSpeed] = useState(1)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const demoSurface = useRef<HTMLDivElement>(null)
  const recorder = useRef(new InPageRecorder())
  const importInput = useRef<HTMLInputElement>(null)
  const skipNextAutosave = useRef(false)

  const duration = Math.max(1000, events.at(-1)?.timestamp ?? 0)
  const selectedEvent = useMemo(() => events.reduce((best, event) => Math.abs(event.timestamp - currentTime) < Math.abs(best.timestamp - currentTime) ? event : best, events[0]), [currentTime, events])
  const selectedIndex = events.findIndex((event) => event.id === selectedEvent?.id)
  const replaySnapshot = useMemo(() => events.filter((event) => event.timestamp <= currentTime).at(-1)?.snapshot ?? initialSnapshot, [currentTime, events])
  const displayedSnapshot = isRecording ? liveSnapshot : replaySnapshot
  const recording: Recording = useMemo(() => ({ schemaVersion: 1, id: sessionId, title, duration, createdAt, events }), [createdAt, duration, events, sessionId, title])

  // Test E (persistence): on first mount, look for a session this browser already
  // saved to IndexedDB and restore it before anything gets auto-saved over it.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const all = await getAllRecordings()
        if (cancelled) return
        setSavedRecordings(all)
        const lastId = window.localStorage.getItem(lastSessionKey)
        const restored = lastId ? all.find((item) => item.id === lastId) : undefined
        if (restored) {
          setSessionId(restored.id)
          setTitle(restored.title)
          setCreatedAt(restored.createdAt)
          setEvents(restored.events)
          setCurrentTime(restored.duration)
          setNotice(`Restored "${restored.title}" from this browser`)
          skipNextAutosave.current = true
        }
      } catch {
        setNotice('Local storage unavailable in this browser')
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!isPlaying) return undefined
    const timer = window.setInterval(() => setCurrentTime((time) => {
      if (time >= duration) { setIsPlaying(false); return duration }
      return Math.min(time + 80 * speed, duration)
    }), 80)
    return () => window.clearInterval(timer)
  }, [duration, isPlaying, speed])

  useEffect(() => {
    if (!isRecording || !demoSurface.current) return undefined
    const activeRecorder = recorder.current
    const startedAt = new Date().toISOString()
    const startEvent: RecordingEvent = { id: crypto.randomUUID(), timestamp: 0, kind: 'click', icon: 'START', label: 'Recording started', description: 'Capture began on the REWIND demo surface', category: 'Recording', target: 'rewind-demo', snapshot: initialSnapshot }
    setSessionId(crypto.randomUUID())
    setRedoStack([])
    setTitle('Untitled recording')
    setCreatedAt(startedAt)
    setEvents([startEvent])
    setCurrentTime(0)
    setLiveSnapshot(initialSnapshot)
    setNotice('Recording in this browser only')
    activeRecorder.start(demoSurface.current, (event) => {
      setEvents((previous) => {
        const snapshot = snapshotFor(event, previous.at(-1)?.snapshot ?? initialSnapshot)
        return [...previous, { ...event, snapshot }]
      })
      setCurrentTime(event.timestamp)
      setRedoStack([])
    })
    return () => activeRecorder.stop()
  }, [isRecording])

  // Test D (scrubbing) for scroll: while replaying/scrubbing (not live recording),
  // move the demo surface's real scroll position to match the reconstructed state.
  useEffect(() => {
    if (isRecording) return
    const node = demoSurface.current
    if (node) node.scrollTop = displayedSnapshot.scrollY ?? 0
  }, [displayedSnapshot.scrollY, isRecording])

  useEffect(() => {
    if (!hydrated || isRecording || events.length === 0) return
    if (skipNextAutosave.current) { skipNextAutosave.current = false; return }
    void saveRecording(recording)
      .then(() => {
        window.localStorage.setItem(lastSessionKey, recording.id)
        setNotice('Local session / Autosaved')
        return getAllRecordings()
      })
      .then((all) => setSavedRecordings(all))
      .catch(() => setNotice('Local save unavailable'))
  }, [events, hydrated, isRecording, recording])

  const selectEvent = (event: RecordingEvent) => { setCurrentTime(event.timestamp); setIsPlaying(false) }
  const stepEvent = (offset: number) => {
    const target = events[Math.min(events.length - 1, Math.max(0, selectedIndex + offset))]
    if (target) selectEvent(target)
  }

  // The anchor event (index 0 — "Recording started" or a loaded recording's
  // first event) is never removed, so there's always a defined state to land on.
  const canUndo = events.length > 1
  const canRedo = redoStack.length > 0

  const applyRestoredState = (snapshot: ReplaySnapshot | undefined, timestamp: number) => {
    const restored = snapshot ?? initialSnapshot
    setCurrentTime(timestamp)
    if (isRecording) setLiveSnapshot(restored)
    if (demoSurface.current) demoSurface.current.scrollTop = restored.scrollY ?? 0
  }

  const undoLast = () => {
    if (!canUndo) return
    setIsPlaying(false)
    setEvents((previous) => {
      const popped = previous.at(-1)
      const rest = previous.slice(0, -1)
      if (!popped) return previous
      const newLast = rest.at(-1)
      applyRestoredState(newLast?.snapshot, newLast?.timestamp ?? 0)
      setRedoStack((stack) => [...stack, popped])
      setNotice(`Undid "${popped.label}"`)
      return rest
    })
  }

  const redoLast = () => {
    if (!canRedo) return
    setIsPlaying(false)
    setRedoStack((stack) => {
      const restored = stack.at(-1)
      if (!restored) return stack
      setEvents((previous) => [...previous, restored])
      applyRestoredState(restored.snapshot, restored.timestamp)
      setNotice(`Redid "${restored.label}"`)
      return stack.slice(0, -1)
    })
  }

  const stopOrStart = () => setIsRecording((recordingActive) => !recordingActive)

  const chooseSize = (size: string) => {
    if (isRecording) setLiveSnapshot((state) => ({ ...state, selectedSize: size, message: `Size ${size} selected` }))
  }

  const updatePromo = (event: ChangeEvent<HTMLInputElement>) => {
    if (isRecording) setLiveSnapshot((state) => ({ ...state, promoCode: event.target.value, message: event.target.value ? 'Promo code entered' : 'Promo code cleared' }))
  }

  const addToBag = () => {
    if (isRecording) setLiveSnapshot((state) => ({ ...state, bagCount: state.bagCount + 1, message: 'Everyday Runner added to bag' }))
  }

  const exportRecording = () => {
    const file = new Blob([JSON.stringify(recording, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = url
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'rewind-recording'}.rewind.json`
    link.click()
    URL.revokeObjectURL(url)
    setNotice('Recording exported as .rewind.json')
  }

  const importRecording = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      if (!isValidRecording(parsed)) throw new Error('Not a REWIND recording')
      setIsPlaying(false)
      setIsRecording(false)
      setSessionId(parsed.id)
      setRedoStack([])
      setTitle(parsed.title)
      setCreatedAt(parsed.createdAt)
      setEvents(parsed.events)
      setCurrentTime(parsed.duration)
      setNotice(`Imported ${file.name}`)
    } catch {
      setNotice('Import failed: choose a valid .rewind.json file')
    } finally {
      event.target.value = ''
    }
  }

  const loadRecording = (target: Recording) => {
    setIsPlaying(false)
    setIsRecording(false)
    setSessionId(target.id)
    setRedoStack([])
    setTitle(target.title)
    setCreatedAt(target.createdAt)
    setEvents(target.events)
    setCurrentTime(target.duration)
    window.localStorage.setItem(lastSessionKey, target.id)
    setNotice(`Loaded "${target.title}"`)
  }

  const removeRecording = (event: ReactMouseEvent, id: string, name: string) => {
    event.stopPropagation()
    void deleteRecording(id)
      .then(getAllRecordings)
      .then((all) => { setSavedRecordings(all); setNotice(`Deleted "${name}" from local storage`) })
  }

  const clearLocalData = () => {
    if (!window.confirm('Clear every recording saved in this browser? This cannot be undone.')) return
    void clearAllRecordings().then(() => {
      window.localStorage.removeItem(lastSessionKey)
      setSavedRecordings([])
      setNotice('Local storage cleared — import a .rewind.json to bring a recording back')
    })
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement
      const typing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      if (event.key === '?') { setShowShortcuts((value) => !value); return }
      if (typing) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && event.shiftKey) { event.preventDefault(); redoLast(); return }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); undoLast(); return }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'y') { event.preventDefault(); redoLast(); return }
      if (event.code === 'Space') { event.preventDefault(); setIsPlaying((value) => !value) }
      else if (event.key === 'ArrowRight') { event.preventDefault(); stepEvent(1) }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); stepEvent(-1) }
      else if (event.key.toLowerCase() === 'r') { setIsPlaying(false); setIsRecording((value) => !value) }
      else if (event.key.toLowerCase() === 'e') { exportRecording() }
      else if (event.key === 'Escape') { setShowShortcuts(false) }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, selectedIndex, recording, title, canUndo, canRedo])

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#workspace" aria-label="REWIND home"><span className="brand-mark">R</span>REWIND</a>
      <span className="session-status"><i />{notice}</span>
      <div className="topbar-actions"><button aria-label="Keyboard shortcuts" aria-pressed={showShortcuts} onClick={() => setShowShortcuts((value) => !value)}>?</button><button className="avatar" aria-label="Profile">R</button></div>
    </header>
    {showShortcuts && <div className="shortcuts-panel" role="dialog" aria-label="Keyboard shortcuts">
      <div className="shortcuts-head"><strong>Keyboard shortcuts</strong><button onClick={() => setShowShortcuts(false)} aria-label="Close shortcuts">×</button></div>
      <dl>
        <div><dt>Space</dt><dd>Play / pause replay</dd></div>
        <div><dt>← →</dt><dd>Previous / next event</dd></div>
        <div><dt>⌘/Ctrl Z</dt><dd>Undo last action</dd></div>
        <div><dt>⇧⌘/Ctrl Z</dt><dd>Redo</dd></div>
        <div><dt>R</dt><dd>Start / stop recording</dd></div>
        <div><dt>E</dt><dd>Export recording</dd></div>
        <div><dt>?</dt><dd>Toggle this panel</dd></div>
      </dl>
    </div>}
    <section className="workspace" id="workspace">
      <aside className="sidebar">
        <button className="new-session" onClick={() => { setIsPlaying(false); setIsRecording(true) }}>+ New recording</button>
        <nav>
          <a className="nav-active" href="#workspace">Current session</a>
          <p className="recordings-heading">Recordings <b>{savedRecordings.length}</b></p>
          <div className="recordings-list" id="recordings">
            {savedRecordings.length === 0 && <p className="empty-hint">Nothing saved in this browser yet</p>}
            {savedRecordings.map((item) => (
              <button key={item.id} className={item.id === sessionId ? 'recording-row recording-row-active' : 'recording-row'} onClick={() => loadRecording(item)}>
                <span>{item.title}</span>
                <small>{item.events.length} events</small>
                <i role="button" aria-label={`Delete ${item.title}`} onClick={(event) => removeRecording(event, item.id, item.title)}>×</i>
              </button>
            ))}
          </div>
          <button onClick={() => importInput.current?.click()}>Import recording</button>
        </nav>
        <footer><a href="#about">About REWIND</a><button className="link-button" onClick={clearLocalData}>Clear local data</button><p>v0.2.0 / Local-first</p></footer>
      </aside>
      <div className="content">
        <div className="title-row">
          <div><p className="eyebrow">RECORDING WORKSPACE</p><input className="title-input" value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Recording title" /><p className="subtitle">rewind.demo / supported surface / {new Date(createdAt).toLocaleString()}</p></div>
          <div className="header-controls"><button className="secondary" aria-label="Undo last action" title="Undo last action (Ctrl/Cmd+Z)" disabled={!canUndo} onClick={undoLast}>Undo</button><button className="secondary" aria-label="Redo" title="Redo (Ctrl/Cmd+Shift+Z)" disabled={!canRedo} onClick={redoLast}>Redo</button><button className="secondary" onClick={exportRecording}>Export</button><button className={isRecording ? 'record recording-active' : 'record'} onClick={stopOrStart}><i />{isRecording ? 'Stop recording' : 'Start recording'}</button></div>
        </div>
        <input className="visually-hidden" ref={importInput} type="file" accept="application/json,.rewind.json" onChange={importRecording} />
        <section className="replay" aria-label="Replay surface">
          <div className="browser"><div className="browserbar"><span className="dots">o o o</span><span className="address">rewind.demo/checkout</span><small>Supported surface</small></div>
            <div className="page" ref={demoSurface} data-rewind-target="page-scroll" data-rewind-label="product page">
              <div className="demo-nav"><strong>mode</strong><span>Shop / Journal / About / Bag ({displayedSnapshot.bagCount})</span></div>
              <div className="product"><div className="product-photo"><span>SPRING / 24</span><i /></div><div className="product-info"><p className="eyebrow">FORM 01</p><h2>Everyday Runner</h2><p>$148.00</p><div>{['8', '9', '10', '11'].map((size) => <button key={size} className={displayedSnapshot.selectedSize === size ? 'selected-size' : ''} data-rewind-label={`size ${size}`} data-rewind-target={`size:${size}`} onClick={() => chooseSize(size)}>{size}</button>)}</div><input className="promo" aria-label="Promo code" data-rewind-label="promo code" data-rewind-target="promo-code" placeholder="Promo code" value={displayedSnapshot.promoCode} onChange={updatePromo} disabled={!isRecording} /><button className="add" data-rewind-label="add to bag" data-rewind-target="add-to-bag" onClick={addToBag}>Add to bag <b>-&gt;</b></button><p className="demo-message" aria-live="polite">{displayedSnapshot.message}</p></div>
                <div className="product-details">
                  <h3>Details</h3>
                  <p>Recycled foam midsole. Breathable engineered mesh upper. Reflective heel tab for low-light visibility.</p>
                  <h3>Shipping &amp; returns</h3>
                  <p>Ships within 2 business days. Free returns within 30 days of delivery.</p>
                  <h3>Reviews</h3>
                  <p>"Best daily trainer I've owned, and it replays exactly how I checked out." — verified buyer</p>
                  <p>Scroll this panel while recording — REWIND captures the scroll position too.</p>
                </div>
              </div>
              <div className="cursor" style={{ left: `${18 + currentTime / duration * 56}%` }} /><span className="replay-tag">{selectedEvent?.label ?? 'Ready'}</span>
            </div>
          </div>
        </section>
        <section className="timeline">
          <div className="timeline-head"><div><p className="eyebrow">TIMELINE</p><strong>{formatTime(currentTime)} <span>/ {formatTime(duration)}</span></strong></div><div className="controls"><button aria-label="Go to start" onClick={() => { setCurrentTime(0); setIsPlaying(false) }}>|&lt;</button><button className="play" aria-label={isPlaying ? 'Pause replay' : 'Play replay'} onClick={() => setIsPlaying(!isPlaying)}>{isPlaying ? 'II' : '>'}</button><button aria-label="Go to end" onClick={() => { setCurrentTime(duration); setIsPlaying(false) }}>&gt;|</button></div><button className="speed" aria-label="Playback speed" onClick={() => setSpeed((value) => (value >= 4 ? 1 : value * 2))}>{speed}x</button></div>
          <div className="scrubber"><input aria-label="Timeline position" type="range" min="0" max={duration} value={currentTime} onChange={(event) => { setCurrentTime(Number(event.target.value)); setIsPlaying(false) }} />{events.map((event) => <button key={event.id} className={`marker ${event.kind} ${selectedEvent?.id === event.id ? 'current' : ''}`} style={{ left: `${event.timestamp / duration * 100}%` }} onClick={() => selectEvent(event)} aria-label={`Jump to ${event.label}`} />)}<div className="ticks"><span>00:00</span><span>{formatTime(duration / 3)}</span><span>{formatTime(duration * 2 / 3)}</span><span>{formatTime(duration)}</span></div></div>
          <div className="event-list">{events.map((event) => <button key={event.id} className={selectedEvent?.id === event.id ? 'event selected-event' : 'event'} onClick={() => selectEvent(event)}><i className={event.kind}>{event.icon}</i><span><b>{event.label}</b><small>{event.description}</small><time>{formatTime(event.timestamp)}</time></span></button>)}</div>
        </section>
      </div>
      <aside className="inspector" id="about"><div className="inspector-head"><div><p className="eyebrow">EVENT INSPECTOR</p><h2>{selectedEvent?.label ?? 'No event selected'}</h2></div><button aria-label="More options">...</button></div><div className="event-summary"><i className={selectedEvent?.kind}>{selectedEvent?.icon ?? 'INFO'}</i><div><strong>{formatTime(selectedEvent?.timestamp ?? 0)}</strong><p>{selectedEvent?.category ?? 'Recording'}</p></div></div><dl><div><dt>Event type</dt><dd>{selectedEvent?.kind ?? '—'}</dd></div><div><dt>Target</dt><dd>{selectedEvent?.target ?? 'rewind-demo'}</dd></div><div><dt>Action</dt><dd>{selectedEvent?.description ?? 'Start a recording to capture an interaction.'}</dd></div><div><dt>Recorded size</dt><dd>{selectedEvent ? `${byteSize(selectedEvent)} bytes` : '—'}</dd></div><div><dt>Viewport</dt><dd>1440 x 900</dd></div></dl><div className="snapshot"><p>Reconstructed state</p><div><b>mode</b><span>Size {displayedSnapshot.selectedSize} / Bag ({displayedSnapshot.bagCount})</span><em>{displayedSnapshot.promoCode || 'No promo'}</em><i /></div></div><button className="compare" onClick={() => setCurrentTime(Math.max(0, (selectedEvent?.timestamp ?? 0) - 1))}>Compare with previous state</button></aside>
    </section>
  </main>
}

export default App
