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

// ── Analytics / Focus engine types (mirrors daemon/analytics/focusEngine.ts) ──

export type AppCategory = 'ide' | 'terminal' | 'design' | 'browser' | 'communication' | 'utility'

export interface AppUsage {
  appName: string
  durationMs: number
  durationMinutes: number
  percentage: number
  category: AppCategory
}

export interface HourlyHeatmapBucket {
  /** 0–23 */
  hour: number
  /** 0–100 */
  focusScore: number
  momentCount: number
}

export interface FocusReport {
  focusScore: number
  contextSwitchesPerHour: number
  totalDurationMinutes: number
  distractionSpikeCount: number
  appBreakdown: AppUsage[]
  hourlyHeatmap: HourlyHeatmapBucket[]
}
