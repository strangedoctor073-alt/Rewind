/**
 * REWIND Grand Dashboard Types
 */

export interface DashboardMoment {
  id: string
  timestamp: number
  appName: string
  windowTitle: string
  processPath?: string
  pid?: number
  bounds?: { x: number; y: number; width: number; height: number }
  phash?: string
  ocrText?: string
  ocrTokens?: Array<{ word: string; x: number; y: number; width: number; height: number }>
  gitBranch?: string
  isClosed?: boolean
  screenshotUrl?: string
  domTarget?: string
}

export type DashboardViewMode = 'flow' | 'filmstrip' | 'diff' | 'telemetry'

export interface TelemetryStats {
  focusScore: number // 0 - 100
  contextSwitchesPerHour: number
  activeSessionDurationMinutes: number
  walStatus: 'clean' | 'syncing' | 'dirty'
  momentsRecorded: number
}
