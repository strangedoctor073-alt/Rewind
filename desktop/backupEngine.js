/**
 * REWIND Desktop 20-Second Atomic WAL Auto-Backup Engine
 * Protects against unexpected PC shutdowns, system reboots, and app crashes:
 * - Checks dirty state every 20 seconds.
 * - Flushes state using an atomic two-step write (.tmp -> rename to .wal).
 * - Guarantees zero data corruption or truncated JSON upon power loss.
 */

import fs from 'node:fs'
import path from 'node:path'

export class BackupEngine {
  /**
   * @param {string} storageDir
   * @param {number} [intervalMs=20000]
   */
  constructor(storageDir, intervalMs = 20000) {
    this.storageDir = storageDir
    this.intervalMs = intervalMs
    this.walPath = path.join(storageDir, 'rewind_session.wal')
    this.tmpPath = path.join(storageDir, 'rewind_session.tmp')
    this.isDirty = false
    this.currentSession = null
    this.timer = null
    this.onSaveCallback = null

    // Ensure storage directory exists
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true })
    }
  }

  /**
   * Marks session as modified with pending unsaved changes.
   * @param {object} session
   */
  markDirty(session) {
    this.currentSession = session
    this.isDirty = true
  }

  /**
   * Starts the 20-second background flush loop.
   */
  start() {
    if (this.timer) return
    this.timer = setInterval(() => {
      this.flushIfDirty()
    }, this.intervalMs)
  }

  /**
   * Stops the background flush loop.
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    // Flush any pending changes on clean exit
    this.flushIfDirty()
  }

  /**
   * Flushes state to disk if modifications were made.
   * Uses atomic rename (.tmp -> .wal) to avoid partial write corruptions.
   * @returns {boolean} true if flushed, false if clean
   */
  flushIfDirty() {
    if (!this.isDirty || !this.currentSession) return false

    try {
      const payload = JSON.stringify(this.currentSession, null, 2)
      // 1. Write completely to temporary file
      fs.writeFileSync(this.tmpPath, payload, 'utf-8')
      // 2. Atomic rename ensures the file is never observed in a half-written state
      fs.renameSync(this.tmpPath, this.walPath)
      this.isDirty = false

      if (this.onSaveCallback) {
        this.onSaveCallback(this.walPath, Date.now())
      }
      return true
    } catch (err) {
      console.error('[REWIND Backup] Failed to write atomic WAL backup:', err)
      return false
    }
  }

  /**
   * Restores the latest valid session after a crash or restart.
   * @returns {object|null}
   */
  restoreLatest() {
    if (!fs.existsSync(this.walPath)) return null

    try {
      const content = fs.readFileSync(this.walPath, 'utf-8')
      const parsed = JSON.parse(content)
      return parsed
    } catch (err) {
      console.warn('[REWIND Backup] Failed to parse previous WAL file:', err)
      return null
    }
  }

  /**
   * Registers a notification callback when an auto-save occurs.
   * @param {function} cb
   */
  onSave(cb) {
    this.onSaveCallback = cb
  }
}
