import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { demoRecording } from './data/demoRecording'
import { InPageRecorder } from './recorder/inPageRecorder'
import { saveRecording } from './storage/recordingStore'
import type { Recording, RecordingEvent, ReplaySnapshot } from './types/recording'
import './App.css'
import './recorder.css'
import './final.css'

const initialSnapshot: ReplaySnapshot = { selectedSize: '10', promoCode: '', bagCount: 2, message: 'Ready to explore' }
const formatTime = (milliseconds: number) => `00:${Math.floor(milliseconds / 1000).toString().padStart(2, '0')}`

function snapshotFor(event: RecordingEvent, previous: ReplaySnapshot): ReplaySnapshot {
  if (event.target.startsWith('size:')) {
    const selectedSize = event.target.split(':')[1]
    return { ...previous, selectedSize, message: `Size ${selectedSize} selected` }
  }
  if (event.target === 'promo-code') return { ...previous, promoCode: event.value ?? '', message: event.value ? 'Promo code entered' : 'Promo code cleared' }
  if (event.target === 'add-to-bag') return { ...previous, bagCount: previous.bagCount + 1, message: `Everyday Runner added to bag` }
  return { ...previous, message: event.label }
}

function isValidRecording(value: unknown): value is Recording {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Recording>
  return candidate.schemaVersion === 1 && typeof candidate.id === 'string' && typeof candidate.title === 'string' && typeof candidate.createdAt === 'string' && typeof candidate.duration === 'number' && Array.isArray(candidate.events) && candidate.events.length > 0
}

function App() {
  const [events, setEvents] = useState<RecordingEvent[]>(demoRecording.events)
  const [currentTime, setCurrentTime] = useState(demoRecording.duration)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [title, setTitle] = useState(demoRecording.title)
  const [sessionId, setSessionId] = useState(demoRecording.id)
  const [createdAt, setCreatedAt] = useState(demoRecording.createdAt)
  const [liveSnapshot, setLiveSnapshot] = useState<ReplaySnapshot>(initialSnapshot)
  const [notice, setNotice] = useState('Local session / Autosaved')
  const demoSurface = useRef<HTMLDivElement>(null)
  const recorder = useRef(new InPageRecorder())
  const importInput = useRef<HTMLInputElement>(null)

  const duration = Math.max(1000, events.at(-1)?.timestamp ?? 0)
  const selectedEvent = useMemo(() => events.reduce((best, event) => Math.abs(event.timestamp - currentTime) < Math.abs(best.timestamp - currentTime) ? event : best, events[0]), [currentTime, events])
  const replaySnapshot = useMemo(() => events.filter((event) => event.timestamp <= currentTime).at(-1)?.snapshot ?? initialSnapshot, [currentTime, events])
  const displayedSnapshot = isRecording ? liveSnapshot : replaySnapshot
  const recording: Recording = useMemo(() => ({ schemaVersion: 1, id: sessionId, title, duration, createdAt, events }), [createdAt, duration, events, sessionId, title])

  useEffect(() => {
    if (!isPlaying) return undefined
    const timer = window.setInterval(() => setCurrentTime((time) => {
      if (time >= duration) { setIsPlaying(false); return duration }
      return Math.min(time + 80, duration)
    }), 80)
    return () => window.clearInterval(timer)
  }, [duration, isPlaying])

  useEffect(() => {
    if (!isRecording || !demoSurface.current) return undefined
    const activeRecorder = recorder.current
    const startedAt = new Date().toISOString()
    const startEvent: RecordingEvent = { id: crypto.randomUUID(), timestamp: 0, kind: 'click', icon: 'START', label: 'Recording started', description: 'Capture began on the REWIND demo surface', category: 'Recording', target: 'rewind-demo', snapshot: initialSnapshot }
    setSessionId(crypto.randomUUID())
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
    })
    return () => activeRecorder.stop()
  }, [isRecording])

  useEffect(() => {
    if (isRecording || events.length === 0) return
    void saveRecording(recording).then(() => setNotice('Local session / Autosaved')).catch(() => setNotice('Local save unavailable'))
  }, [events, isRecording, recording])

  const selectEvent = (event: RecordingEvent) => { setCurrentTime(event.timestamp); setIsPlaying(false) }
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

  return <main className="app-shell">
    <header className="topbar">
      <a className="brand" href="#workspace" aria-label="REWIND home"><span className="brand-mark">R</span>REWIND</a>
      <span className="session-status"><i />{notice}</span>
      <div className="topbar-actions"><button aria-label="Keyboard shortcuts">?</button><button className="avatar" aria-label="Profile">R</button></div>
    </header>
    <section className="workspace" id="workspace">
      <aside className="sidebar">
        <button className="new-session" onClick={() => { setIsPlaying(false); setIsRecording(true) }}>+ New recording</button>
        <nav><a className="nav-active" href="#workspace">Current session</a><a href="#recordings">Recordings <b>{events.length}</b></a><button onClick={() => importInput.current?.click()}>Import recording</button></nav>
        <footer><a href="#about">About REWIND</a><p>v0.1.0 / Local-first</p></footer>
      </aside>
      <div className="content">
        <div className="title-row">
          <div><p className="eyebrow">RECORDING WORKSPACE</p><input className="title-input" value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Recording title" /><p className="subtitle">rewind.demo / supported surface / {new Date(createdAt).toLocaleString()}</p></div>
          <div className="header-controls"><button className="secondary" onClick={exportRecording}>Export</button><button className={isRecording ? 'record recording-active' : 'record'} onClick={stopOrStart}><i />{isRecording ? 'Stop recording' : 'Start recording'}</button></div>
        </div>
        <input className="visually-hidden" ref={importInput} type="file" accept="application/json,.rewind.json" onChange={importRecording} />
        <section className="replay" aria-label="Replay surface">
          <div className="browser"><div className="browserbar"><span className="dots">o o o</span><span className="address">rewind.demo/checkout</span><small>Supported surface</small></div>
            <div className="page" ref={demoSurface}>
              <div className="demo-nav"><strong>mode</strong><span>Shop / Journal / About / Bag ({displayedSnapshot.bagCount})</span></div>
              <div className="product"><div className="product-photo"><span>SPRING / 24</span><i /></div><div className="product-info"><p className="eyebrow">FORM 01</p><h2>Everyday Runner</h2><p>$148.00</p><div>{['8', '9', '10', '11'].map((size) => <button key={size} className={displayedSnapshot.selectedSize === size ? 'selected-size' : ''} data-rewind-label={`size ${size}`} data-rewind-target={`size:${size}`} onClick={() => chooseSize(size)}>{size}</button>)}</div><input className="promo" aria-label="Promo code" data-rewind-label="promo code" data-rewind-target="promo-code" placeholder="Promo code" value={displayedSnapshot.promoCode} onChange={updatePromo} disabled={!isRecording} /><button className="add" data-rewind-label="add to bag" data-rewind-target="add-to-bag" onClick={addToBag}>Add to bag <b>-&gt;</b></button><p className="demo-message" aria-live="polite">{displayedSnapshot.message}</p></div></div>
              <div className="cursor" style={{ left: `${18 + currentTime / duration * 56}%` }} /><span className="replay-tag">{selectedEvent?.label ?? 'Ready'}</span>
            </div>
          </div>
        </section>
        <section className="timeline" id="recordings">
          <div className="timeline-head"><div><p className="eyebrow">TIMELINE</p><strong>{formatTime(currentTime)} <span>/ {formatTime(duration)}</span></strong></div><div className="controls"><button aria-label="Go to start" onClick={() => { setCurrentTime(0); setIsPlaying(false) }}>|&lt;</button><button className="play" aria-label={isPlaying ? 'Pause replay' : 'Play replay'} onClick={() => setIsPlaying(!isPlaying)}>{isPlaying ? 'II' : '>'}</button><button aria-label="Go to end" onClick={() => { setCurrentTime(duration); setIsPlaying(false) }}>&gt;|</button></div><button className="speed" disabled>1x</button></div>
          <div className="scrubber"><input aria-label="Timeline position" type="range" min="0" max={duration} value={currentTime} onChange={(event) => { setCurrentTime(Number(event.target.value)); setIsPlaying(false) }} />{events.map((event) => <button key={event.id} className={`marker ${event.kind} ${selectedEvent?.id === event.id ? 'current' : ''}`} style={{ left: `${event.timestamp / duration * 100}%` }} onClick={() => selectEvent(event)} aria-label={`Jump to ${event.label}`} />)}<div className="ticks"><span>00:00</span><span>{formatTime(duration / 3)}</span><span>{formatTime(duration * 2 / 3)}</span><span>{formatTime(duration)}</span></div></div>
          <div className="event-list">{events.map((event) => <button key={event.id} className={selectedEvent?.id === event.id ? 'event selected-event' : 'event'} onClick={() => selectEvent(event)}><i className={event.kind}>{event.icon}</i><span><b>{event.label}</b><small>{event.description}</small><time>{formatTime(event.timestamp)}</time></span></button>)}</div>
        </section>
      </div>
      <aside className="inspector" id="about"><div className="inspector-head"><div><p className="eyebrow">EVENT INSPECTOR</p><h2>{selectedEvent?.label ?? 'No event selected'}</h2></div><button aria-label="More options">...</button></div><div className="event-summary"><i className={selectedEvent?.kind}>{selectedEvent?.icon ?? 'INFO'}</i><div><strong>{formatTime(selectedEvent?.timestamp ?? 0)}</strong><p>{selectedEvent?.category ?? 'Recording'}</p></div></div><dl><div><dt>Target</dt><dd>{selectedEvent?.target ?? 'rewind-demo'}</dd></div><div><dt>Action</dt><dd>{selectedEvent?.description ?? 'Start a recording to capture an interaction.'}</dd></div><div><dt>Viewport</dt><dd>1440 x 900</dd></div></dl><div className="snapshot"><p>Reconstructed state</p><div><b>mode</b><span>Size {displayedSnapshot.selectedSize} / Bag ({displayedSnapshot.bagCount})</span><em>{displayedSnapshot.promoCode || 'No promo'}</em><i /></div></div><button className="compare" onClick={() => setCurrentTime(Math.max(0, (selectedEvent?.timestamp ?? 0) - 1))}>Compare with previous state</button></aside>
    </section>
  </main>
}

export default App
