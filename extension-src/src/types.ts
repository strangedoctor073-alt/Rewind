// These intentionally differ from src/types/recording.ts in the main app:
// that file's ReplaySnapshot (selectedSize/promoCode/bagCount) only makes
// sense for the bundled shopping demo. Real captured browser events have no
// such reconstructed-state snapshot yet, so giving them their own type keeps
// this honest instead of forcing them into a shape that implies state
// restoration the extension doesn't actually do.

export interface BrowserRecordingEvent {
  id: string
  timestamp: number
  kind: 'click' | 'type' | 'scroll'
  icon: string
  label: string
  description: string
  category: string
  target: string
  url?: string
  title?: string
  scrollX?: number
  scrollY?: number
  value?: string
  masked?: boolean
}

export interface BrowserRecordingSource {
  url: string
  title: string
  mode: string
}

export interface BrowserRecording {
  schemaVersion: 1
  id: string
  title: string
  duration: number
  createdAt: string
  source?: BrowserRecordingSource
  events: BrowserRecordingEvent[]
  active?: boolean
}

export interface RecordingSummary {
  id: string
  title: string
  url: string
  host: string
  createdAt: string
  duration: number
  eventCount: number
  active: boolean
}

export interface RewindResult {
  ok: true
  tabId: number
  scrolledTo: number | null
  note?: string
}
