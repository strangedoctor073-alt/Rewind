export type RecordingEventKind = 'click' | 'type' | 'scroll'

export interface ReplaySnapshot {
  selectedSize: string
  promoCode: string
  bagCount: number
  message: string
  scrollY?: number
}

export interface RecordingEvent {
  id: string
  timestamp: number
  kind: RecordingEventKind
  icon: string
  label: string
  description: string
  category: string
  target: string
  value?: string
  snapshot?: ReplaySnapshot
}

export interface Recording {
  schemaVersion: 1
  id: string
  title: string
  duration: number
  createdAt: string
  events: RecordingEvent[]
}
