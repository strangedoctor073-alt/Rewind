import { describe, it, expect } from 'vitest'
import { FocusEngine, categorizeApp } from '../focusEngine.js'
import type { DbMoment } from '../../db/timelineDb.js'

describe('FocusEngine', () => {
  it('correctly categorizes applications', () => {
    expect(categorizeApp('Code.exe')).toBe('ide')
    expect(categorizeApp('cursor')).toBe('ide')
    expect(categorizeApp('WindowsTerminal.exe')).toBe('terminal')
    expect(categorizeApp('pwsh.exe')).toBe('terminal')
    expect(categorizeApp('chrome.exe')).toBe('browser')
    expect(categorizeApp('Slack.exe')).toBe('communication')
    expect(categorizeApp('calc.exe')).toBe('utility')
  })

  it('computes high focus score for uninterrupted IDE coding session', () => {
    const now = Date.now()
    const moments: DbMoment[] = Array.from({ length: 30 }, (_, i) => ({
      id: `m-${i}`,
      timestamp: now + i * 2000,
      appName: 'Code.exe',
      windowTitle: 'editor.ts - REWIND',
    }))

    const report = FocusEngine.analyze(moments)
    expect(report.focusScore).toBeGreaterThanOrEqual(90)
    expect(report.contextSwitchesPerHour).toBe(0)
    expect(report.distractionSpikeCount).toBe(0)
    expect(report.appBreakdown[0].category).toBe('ide')
  })

  it('detects context switch velocity and distraction spikes', () => {
    const now = Date.now()
    const apps = ['Code.exe', 'chrome.exe', 'Slack.exe', 'Discord.exe', 'Spotify.exe', 'Outlook.exe']
    // User flipping between 6 different apps rapidly within 60s
    const moments: DbMoment[] = apps.map((appName, i) => ({
      id: `spike-${i}`,
      timestamp: now + i * 5000,
      appName,
      windowTitle: `Window ${i}`,
    }))

    const report = FocusEngine.analyze(moments)
    expect(report.distractionSpikeCount).toBeGreaterThanOrEqual(1)
    expect(report.contextSwitchesPerHour).toBeGreaterThan(0)
    expect(report.focusScore).toBeLessThan(70)
  })

  it('handles empty moments array cleanly', () => {
    const report = FocusEngine.analyze([])
    expect(report.focusScore).toBe(100)
    expect(report.contextSwitchesPerHour).toBe(0)
    expect(report.appBreakdown).toHaveLength(0)
  })
})
