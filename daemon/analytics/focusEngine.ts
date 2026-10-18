/**
 * REWIND Focus & Productivity Analytics Engine
 * Computes Deep Focus Scores, Context-Switch Velocity, distraction spikes, and app heatmaps.
 */

import type { DbMoment } from '../db/timelineDb.js'

export type AppCategory = 'ide' | 'terminal' | 'design' | 'browser' | 'communication' | 'utility'

export interface AppUsage {
  appName: string
  durationMs: number
  durationMinutes: number
  percentage: number
  category: AppCategory
}

export interface HourlyHeatmapBucket {
  hour: number // 0 - 23
  focusScore: number // 0 - 100
  momentCount: number
}

export interface FocusReport {
  focusScore: number // 0 - 100
  contextSwitchesPerHour: number
  totalDurationMinutes: number
  distractionSpikeCount: number
  appBreakdown: AppUsage[]
  hourlyHeatmap: HourlyHeatmapBucket[]
}

const CATEGORY_MAP: Record<string, AppCategory> = {
  // IDEs & Development
  code: 'ide',
  'code.exe': 'ide',
  cursor: 'ide',
  'cursor.exe': 'ide',
  devenv: 'ide',
  'devenv.exe': 'ide',
  idea64: 'ide',
  'idea64.exe': 'ide',
  sublime_text: 'ide',
  nvim: 'ide',

  // Terminals
  windowsterminal: 'terminal',
  'windowsterminal.exe': 'terminal',
  powershell: 'terminal',
  'powershell.exe': 'terminal',
  pwsh: 'terminal',
  'pwsh.exe': 'terminal',
  cmd: 'terminal',
  'cmd.exe': 'terminal',

  // Design
  figma: 'design',
  'figma.exe': 'design',
  photoshop: 'design',
  blender: 'design',

  // Browsers
  chrome: 'browser',
  'chrome.exe': 'browser',
  msedge: 'browser',
  'msedge.exe': 'browser',
  firefox: 'browser',
  'firefox.exe': 'browser',
  brave: 'browser',
  'brave.exe': 'browser',

  // Communication
  slack: 'communication',
  'slack.exe': 'communication',
  teams: 'communication',
  'teams.exe': 'communication',
  discord: 'communication',
  'discord.exe': 'communication',
  outlook: 'communication',
  'outlook.exe': 'communication',
}

export function categorizeApp(appName: string): AppCategory {
  const norm = appName.toLowerCase().trim()
  return CATEGORY_MAP[norm] || 'utility'
}

export class FocusEngine {
  /**
   * Analyze an array of chronologically sorted moments.
   */
  public static analyze(moments: DbMoment[], windowDurationMs = 3600000): FocusReport {
    if (!moments || moments.length === 0) {
      return {
        focusScore: 100,
        contextSwitchesPerHour: 0,
        totalDurationMinutes: 0,
        distractionSpikeCount: 0,
        appBreakdown: [],
        hourlyHeatmap: [],
      }
    }

    const sorted = [...moments].sort((a, b) => a.timestamp - b.timestamp)
    const startTime = sorted[0].timestamp
    const endTime = Math.max(sorted[sorted.length - 1].timestamp, startTime + 1000)
    const totalElapsedMs = Math.max(windowDurationMs, endTime - startTime)
    const totalDurationMinutes = Math.round((endTime - startTime) / 60000)

    // 1. App usage aggregation
    const appDurations = new Map<string, number>()
    let contextSwitches = 0
    let lastApp = ''
    let distractionSpikes = 0

    // Sliding window of 120s for distraction spikes (>5 unique apps)
    const recentAppsWindow: Array<{ app: string; timestamp: number }> = []

    for (let i = 0; i < sorted.length; i++) {
      const m = sorted[i]
      const nextTimestamp = sorted[i + 1]?.timestamp ?? (m.timestamp + 2000)
      const duration = Math.min(Math.max(1000, nextTimestamp - m.timestamp), 60000) // cap pause gaps at 60s
      const app = m.appName || 'Unknown'

      appDurations.set(app, (appDurations.get(app) ?? 0) + duration)

      if (lastApp && app.toLowerCase() !== lastApp.toLowerCase()) {
        contextSwitches++
        recentAppsWindow.push({ app: app.toLowerCase(), timestamp: m.timestamp })

        // Prune entries older than 120s
        while (recentAppsWindow.length > 0 && m.timestamp - recentAppsWindow[0].timestamp > 120000) {
          recentAppsWindow.shift()
        }

        const uniqueInWindow = new Set(recentAppsWindow.map((e) => e.app))
        if (uniqueInWindow.size >= 5) {
          distractionSpikes++
          recentAppsWindow.length = 0 // Reset to avoid double-counting the same spike
        }
      }
      lastApp = app
    }

    // 2. Compute Context Switches per Hour
    const hours = Math.max(1, totalElapsedMs / 3600000)
    const contextSwitchesPerHour = Math.round((contextSwitches / hours) * 10) / 10

    // 3. App breakdown
    const totalTrackedMs = Array.from(appDurations.values()).reduce((a, b) => a + b, 0)
    const appBreakdown: AppUsage[] = Array.from(appDurations.entries())
      .map(([appName, durationMs]) => ({
        appName,
        durationMs,
        durationMinutes: Math.round(durationMs / 60000),
        percentage: totalTrackedMs > 0 ? Math.round((durationMs / totalTrackedMs) * 100) : 0,
        category: categorizeApp(appName),
      }))
      .sort((a, b) => b.durationMs - a.durationMs)

    // 4. Focus score calculation (0 - 100)
    // Positive drivers: time in IDE, terminal, design
    // Negative drivers: context switch velocity, distraction spikes
    const focusMs = appBreakdown
      .filter((a) => a.category === 'ide' || a.category === 'terminal' || a.category === 'design')
      .reduce((sum, a) => sum + a.durationMs, 0)

    const focusRatio = totalTrackedMs > 0 ? focusMs / totalTrackedMs : 1.0
    let baseScore = focusRatio * 100

    // Penalty for switch velocity (> 20 switches/hr starts penalty)
    if (contextSwitchesPerHour > 20) {
      baseScore -= Math.min(30, (contextSwitchesPerHour - 20) * 0.8)
    }

    // Penalty for distraction spikes (-10 per spike)
    baseScore -= distractionSpikes * 10
    const focusScore = Math.max(0, Math.min(100, Math.round(baseScore)))

    // 5. Hourly heatmap
    const hourlyBuckets = new Map<number, { focusCount: number; totalCount: number }>()
    for (let h = 0; h < 24; h++) hourlyBuckets.set(h, { focusCount: 0, totalCount: 0 })

    for (const m of sorted) {
      const hour = new Date(m.timestamp).getHours()
      const bucket = hourlyBuckets.get(hour)!
      bucket.totalCount++
      const cat = categorizeApp(m.appName)
      if (cat === 'ide' || cat === 'terminal' || cat === 'design') {
        bucket.focusCount++
      }
    }

    const hourlyHeatmap: HourlyHeatmapBucket[] = Array.from(hourlyBuckets.entries()).map(([hour, b]) => ({
      hour,
      focusScore: b.totalCount > 0 ? Math.round((b.focusCount / b.totalCount) * 100) : 100,
      momentCount: b.totalCount,
    }))

    return {
      focusScore,
      contextSwitchesPerHour,
      totalDurationMinutes,
      distractionSpikeCount: distractionSpikes,
      appBreakdown,
      hourlyHeatmap,
    }
  }
}
