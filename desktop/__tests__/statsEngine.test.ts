import { describe, it, expect, beforeEach } from 'vitest'
import { StatsEngine } from '../statsEngine.js'

describe('StatsEngine', () => {
  let engine: StatsEngine

  beforeEach(() => {
    engine = new StatsEngine() // in-memory
  })

  it('correctly categorizes developer and office focus applications', () => {
    expect(StatsEngine.categorizeProcess('code.exe')).toBe('focus')
    expect(StatsEngine.categorizeProcess('WindowsTerminal.exe')).toBe('focus')
    expect(StatsEngine.categorizeProcess('slack.exe')).toBe('focus')
    expect(StatsEngine.categorizeProcess('figma.exe')).toBe('focus')
    expect(StatsEngine.categorizeProcess('solitaire.exe')).toBe('general')
    expect(StatsEngine.categorizeProcess('')).toBe('general')
  })

  it('tracks window switches and accumulates active app duration', () => {
    const t0 = 1000000
    engine.recordWindowSwitch('code.exe', t0)

    // Stay in code for 10 minutes (600,000 ms)
    const t1 = t0 + 600000
    engine.recordWindowSwitch('chrome.exe', t1)

    // Stay in chrome for 5 minutes (300,000 ms)
    const t2 = t1 + 300000
    engine.recordWindowSwitch('slack.exe', t2)

    const summary = engine.getSummary()
    expect(summary.contextSwitches).toBe(2)
    expect(summary.topApps.length).toBeGreaterThanOrEqual(2)

    const codeApp = summary.topApps.find((a) => a.processName === 'code')
    expect(codeApp).toBeDefined()
    expect(codeApp?.durationMinutes).toBe(10)
    expect(codeApp?.category).toBe('focus')
  })

  it('records rescues including Ctrl+Z undos and terminal resurrections', () => {
    engine.recordRescue('undo')
    engine.recordRescue('undo')
    engine.recordRescue('terminal_resurrect')
    engine.recordRescue('clipboard_restore')

    const summary = engine.getSummary()
    expect(summary.rescues.total).toBe(4)
    expect(summary.rescues.undo).toBe(2)
    expect(summary.rescues.terminal).toBe(1)
    expect(summary.rescues.clipboard).toBe(1)
  })

  it('calculates focus score based on focus app ratio and switch frequency', () => {
    const t0 = Date.now() - 35 * 60 * 1000
    engine.recordWindowSwitch('code.exe', t0)

    // Work in code uninterrupted for 30 minutes
    const t1 = t0 + 30 * 60 * 1000
    engine.recordWindowSwitch('slack.exe', t1)

    const score = engine.calculateFocusScore(t1 + 60000)
    expect(score).toBeGreaterThanOrEqual(70)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('resets metrics accurately upon reset()', () => {
    engine.recordRescue('undo')
    engine.recordWindowSwitch('code.exe', 1000000)
    engine.recordWindowSwitch('chrome.exe', 2000000)

    engine.reset()
    const summary = engine.getSummary()
    expect(summary.contextSwitches).toBe(0)
    expect(summary.rescues.total).toBe(0)
    expect(summary.topApps.length).toBe(0)
  })
})
