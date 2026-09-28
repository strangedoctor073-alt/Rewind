/**
 * REWIND Desktop Inbuilt Productivity & Activity Stats Engine
 * 100% Local-first, private analytics engine for office workers & developers:
 * - Application Time Distribution (active duration per process)
 * - Context Switch Counter & Switch Frequency per hour
 * - Deep Work / Focus Score calculation (based on uninterrupted focus blocks)
 * - Rescue & Undo Metrics (Ctrl+Z reversals, terminal resurrection, clipboard recovery)
 */

import fs from 'node:fs'
import path from 'node:path'

// High-focus applications commonly used by developers and office knowledge workers
const FOCUS_APP_PATTERNS = [
  /code/i,
  /studio/i,
  /idea/i,
  /sublime/i,
  /terminal/i,
  /pwsh/i,
  /powershell/i,
  /cmd/i,
  /git/i,
  /figma/i,
  /word/i,
  /excel/i,
  /powerpnt/i,
  /notion/i,
  /obsidian/i,
  /slack/i,
  /teams/i,
  /zoom/i,
  /cursor/i,
  /pycharm/i,
  /webstorm/i,
]

export class StatsEngine {
  /**
   * @param {string} [storageDir]
   * @param {number} [retentionDays=30]
   */
  constructor(storageDir = null, retentionDays = 30) {
    this.storageDir = storageDir
    this.retentionDays = retentionDays
    this.statsFile = storageDir ? path.join(storageDir, 'rewind_stats.json') : null

    this.currentApp = null
    this.appStartTime = Date.now()
    this.sessionStartTime = Date.now()

    // In-memory data store
    this.data = {
      appDurations: {}, // { [processName]: totalMs }
      contextSwitches: 0,
      deepWorkBlocksMs: 0,
      undoCount: 0,
      terminalResurrectCount: 0,
      clipboardRestoreCount: 0,
      firstEventTime: Date.now(),
      lastEventTime: Date.now(),
    }

    if (this.statsFile) {
      this.load()
    }
  }

  /**
   * Categorizes process as 'focus', 'utility', or 'general'
   * @param {string} processName
   * @returns {'focus'|'general'}
   */
  static categorizeProcess(processName) {
    if (!processName) return 'general'
    const isFocus = FOCUS_APP_PATTERNS.some((pattern) => pattern.test(processName))
    return isFocus ? 'focus' : 'general'
  }

  /**
   * Records a window switch event and accrues elapsed time to the previous application.
   * @param {string} newProcessName
   * @param {number} [timestamp=Date.now()]
   */
  recordWindowSwitch(newProcessName, timestamp = Date.now()) {
    if (!newProcessName) return

    const sanitizedProc = newProcessName.replace(/\.exe$/i, '').toLowerCase()

    if (this.currentApp) {
      const elapsed = Math.max(0, timestamp - this.appStartTime)
      if (elapsed > 0) {
        this.data.appDurations[this.currentApp] = (this.data.appDurations[this.currentApp] || 0) + elapsed

        // If uninterrupted for >= 10 minutes in a focus app, accumulate deep work
        if (elapsed >= 10 * 60 * 1000 && StatsEngine.categorizeProcess(this.currentApp) === 'focus') {
          this.data.deepWorkBlocksMs += elapsed
        }
      }

      if (this.currentApp !== sanitizedProc) {
        this.data.contextSwitches += 1
      }
    }

    this.currentApp = sanitizedProc
    this.appStartTime = timestamp
    this.data.lastEventTime = timestamp

    this.save()
  }

  /**
   * Records an undo or state rescue action
   * @param {'undo'|'terminal_resurrect'|'clipboard_restore'} type
   */
  recordRescue(type) {
    if (type === 'undo') this.data.undoCount += 1
    else if (type === 'terminal_resurrect') this.data.terminalResurrectCount += 1
    else if (type === 'clipboard_restore') this.data.clipboardRestoreCount += 1
    this.save()
  }

  /**
   * Computes productivity and focus score (0 to 100)
   * @param {number} [now=Date.now()]
   * @returns {number}
   */
  calculateFocusScore(now = Date.now()) {
    const totalMs = this.getTotalActiveTimeMs(now)
    if (totalMs < 60000) return 85 // default baseline

    let focusMs = 0
    for (const [proc, dur] of Object.entries(this.data.appDurations)) {
      if (StatsEngine.categorizeProcess(proc) === 'focus') {
        focusMs += dur
      }
    }
    if (this.currentApp && StatsEngine.categorizeProcess(this.currentApp) === 'focus') {
      const activeCurr = Math.max(0, now - this.appStartTime)
      if (activeCurr < 2 * 60 * 60 * 1000) {
        focusMs += activeCurr
      }
    }

    const focusRatio = Math.min(1, focusMs / totalMs)
    const hours = Math.max(0.5, totalMs / (1000 * 60 * 60))
    const switchPenalty = Math.min(25, (this.data.contextSwitches / hours) * 1.5)

    const rawScore = (focusRatio * 80) + (this.data.deepWorkBlocksMs > 0 ? 20 : 10) - switchPenalty
    return Math.max(10, Math.min(100, Math.round(rawScore)))
  }

  /**
   * Returns total active tracked milliseconds
   * @param {number} [now=Date.now()]
   * @returns {number}
   */
  getTotalActiveTimeMs(now = Date.now()) {
    let total = 0
    for (const dur of Object.values(this.data.appDurations)) {
      total += dur
    }
    if (this.currentApp && now >= this.appStartTime && (now - this.appStartTime) < 2 * 60 * 60 * 1000) {
      total += (now - this.appStartTime)
    }
    return total
  }

  /**
   * Compiles complete productivity analytics snapshot
   */
  getSummary() {
    const totalMs = this.getTotalActiveTimeMs()
    const hoursElapsed = Math.max(0.1, (Date.now() - this.data.firstEventTime) / (1000 * 60 * 60))
    const switchesPerHour = Math.round((this.data.contextSwitches / hoursElapsed) * 10) / 10

    // Build sorted app list
    const appList = []
    for (const [proc, dur] of Object.entries(this.data.appDurations)) {
      const percentage = totalMs > 0 ? Math.round((dur / totalMs) * 100) : 0
      appList.push({
        processName: proc,
        durationMs: dur,
        durationMinutes: Math.round(dur / 60000),
        percentage,
        category: StatsEngine.categorizeProcess(proc),
      })
    }
    appList.sort((a, b) => b.durationMs - a.durationMs)

    return {
      focusScore: this.calculateFocusScore(),
      totalActiveMs: totalMs,
      totalActiveMinutes: Math.round(totalMs / 60000),
      contextSwitches: this.data.contextSwitches,
      switchesPerHour,
      deepWorkMinutes: Math.round(this.data.deepWorkBlocksMs / 60000),
      rescues: {
        total: this.data.undoCount + this.data.terminalResurrectCount + this.data.clipboardRestoreCount,
        undo: this.data.undoCount,
        terminal: this.data.terminalResurrectCount,
        clipboard: this.data.clipboardRestoreCount,
      },
      topApps: appList.slice(0, 8),
    }
  }

  /**
   * Resets collected statistics
   */
  reset() {
    this.data = {
      appDurations: {},
      contextSwitches: 0,
      deepWorkBlocksMs: 0,
      undoCount: 0,
      terminalResurrectCount: 0,
      clipboardRestoreCount: 0,
      firstEventTime: Date.now(),
      lastEventTime: Date.now(),
    }
    this.appStartTime = Date.now()
    this.save()
  }

  load() {
    if (!this.statsFile || !fs.existsSync(this.statsFile)) return
    try {
      const content = fs.readFileSync(this.statsFile, 'utf8')
      const parsed = JSON.parse(content)
      this.data = { ...this.data, ...parsed }
    } catch {
      // transient parse error
    }
  }

  save() {
    if (!this.statsFile) return
    try {
      if (this.storageDir && !fs.existsSync(this.storageDir)) {
        fs.mkdirSync(this.storageDir, { recursive: true })
      }
      fs.writeFileSync(this.statsFile, JSON.stringify(this.data, null, 2), 'utf8')
    } catch {
      // ignore write error
    }
  }
}
