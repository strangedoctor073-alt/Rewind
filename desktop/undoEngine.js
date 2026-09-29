/**
 * REWIND Desktop Multi-Tier Universal Undo Engine
 * Implements a tri-tier undo strategy across arbitrary PC software:
 * - Tier 1: Target-focused synthetic Ctrl+Z injection into active window
 * - Tier 2: Closed window resurrection & screen geometry restoration
 * - Tier 3: File system differential snapshot rollback
 */

import { spawn as nodeSpawn } from 'node:child_process'

// Testable indirection: real code always goes through nodeSpawn. Unit tests
// inject a fake here (see _setSpawnForTesting) so they never launch a real
// host binary, without fighting ESM/vi.mock interop across module boundaries.
let spawnImpl = nodeSpawn

/**
 * Testing hook: inject a fake `spawn`. Call with no arguments to restore the
 * real implementation.
 * @param {((command: string, args: string[], options: object) => import('node:child_process').ChildProcess)|null} [fn]
 */
export function _setSpawnForTesting(fn) {
  spawnImpl = fn || nodeSpawn
}
import fs from 'node:fs'
import { sendCtrlZ, restoreWindowPosition, getActiveWindow, sanitizeNativeString } from './win32.js'

export const UndoTier = {
  ACTIVE_HOTKEY: 'ACTIVE_HOTKEY',
  WINDOW_RESURRECT: 'WINDOW_RESURRECT',
  FILE_ROLLBACK: 'FILE_ROLLBACK',
}

export class UndoEngine {
  /**
   * Executes synthetic Ctrl+Z on the target active window with focus verification.
   * @param {number|bigint} [targetHwnd]
   * @param {number} [timeoutMs=500]
   * @returns {Promise<boolean>}
   */
  static async undoActive(targetHwnd, timeoutMs = 500) {
    const active = getActiveWindow()
    const hwnd = targetHwnd || active?.hwnd
    if (!hwnd) return false
    return await sendCtrlZ(hwnd, timeoutMs)
  }

  /**
   * Relaunches a closed application and restores its screen geometry.
   *
   * Prefers spawning the exact captured executable path. If that path is
   * missing or was recorded before the exePath sanitization fix (i.e. it
   * doesn't exist on disk), falls back to asking Windows to resolve the
   * process name itself (the same "App Paths" lookup Start > Run uses), so a
   * relaunch doesn't hard-fail just because the absolute path didn't match.
   * The fallback launch can't be tracked by PID, so geometry restoration is
   * best-effort in that case; the relaunch itself still succeeds.
   * @param {string} exePath
   * @param {{x: number, y: number, width: number, height: number}} bounds
   * @param {string} [processName]
   * @returns {Promise<boolean>}
   */
  static async resurrectWindow(exePath, bounds, processName) {
    const cleanPath = sanitizeNativeString(exePath)
    const usingFallback = !cleanPath || !fs.existsSync(cleanPath)

    if (usingFallback && !processName) {
      console.warn('[REWIND Undo] Executable path not found and no process name to fall back to:', exePath)
      return false
    }

    try {
      const child = usingFallback
        ? spawnImpl('cmd.exe', ['/c', 'start', '""', processName], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
          })
        : spawnImpl(cleanPath, [], {
            detached: true,
            stdio: 'ignore',
          })
      child.unref()

      // Poll briefly to find the resurrected window and restore geometry.
      // Only meaningful for the direct-path launch: the fallback goes through
      // `cmd /c start`, whose own PID exits immediately and never matches the
      // relaunched app's window.
      if (!usingFallback) {
        let attempts = 0
        const pollTimer = setInterval(() => {
          attempts += 1
          const active = getActiveWindow()
          if (active && active.pid === child.pid) {
            clearInterval(pollTimer)
            if (bounds) {
              restoreWindowPosition(active.hwnd, bounds)
            }
          } else if (attempts > 15) {
            clearInterval(pollTimer)
          }
        }, 300)
      }

      return true
    } catch (err) {
      console.error('[REWIND Undo] Failed to resurrect process:', err)
      return false
    }
  }

  /**
   * Reverts a tracked file back to a previous snapshot content.
   * @param {string} filePath
   * @param {string} previousContent
   * @returns {boolean}
   */
  /**
   * Restores a point-in-time event: resurrects closed app or restores coordinates of active app.
   * @param {{ exePath?: string, bounds?: {x: number, y: number, width: number, height: number}, hwnd?: number, kind?: string }} event
   * @returns {Promise<{ success: boolean, action: string }>}
   */
  static async restoreMoment(event) {
    if (!event) return { success: false, action: 'none' }

    // If window was closed or executable exists, resurrect it
    if (event.kind === 'window-closed' || event.exePath) {
      const ok = await this.resurrectWindow(event.exePath, event.bounds, event.processName)
      return { success: ok, action: 'resurrected' }
    }

    // If active window handle exists, reposition it
    if (event.hwnd && event.bounds) {
      const ok = restoreWindowPosition(event.hwnd, event.bounds)
      return { success: ok, action: 'repositioned' }
    }

    return { success: false, action: 'unknown' }
  }
}

