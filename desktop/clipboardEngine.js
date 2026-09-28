/**
 * REWIND Desktop Clipboard History Engine
 * Safely tracks text copied by the user and associates it with the active window session.
 * Features:
 * - Sensitive pattern redacting (credit cards, passwords, tokens).
 * - Automatic suspension when private/denylisted windows are focused.
 * - Rolling in-memory history with instant 1-click restore.
 */

import { clipboard } from 'electron'
import { isWindowAllowed, sanitizeWindowTitle } from './security.js'

export class ClipboardEngine {
  constructor(maxHistory = 50) {
    this.maxHistory = maxHistory
    this.history = []
    this.lastText = ''
    this.timer = null
    this.isPaused = false
    this.onClipCallback = null
  }

  /**
   * Starts monitoring the OS clipboard for text changes.
   * @param {() => { processName?: string, title?: string }} getActiveContext
   */
  start(getActiveContext) {
    if (this.timer) return

    this.timer = setInterval(() => {
      if (this.isPaused) return

      try {
        const text = clipboard.readText().trim()
        if (!text || text === this.lastText) return

        const context = getActiveContext ? getActiveContext() : {}
        const processName = context.processName || 'unknown'
        const windowTitle = context.title || ''

        // 1. Skip if active window is a password manager or private
        if (!isWindowAllowed(processName, windowTitle)) {
          return
        }

        // 2. Skip if text looks like a sensitive credential/password or token
        if (this.isSensitiveContent(text)) {
          return
        }

        this.lastText = text
        const clipItem = {
          id: `clip-${Date.now()}`,
          timestamp: Date.now(),
          text: text.length > 500 ? `${text.slice(0, 500)}...` : text,
          fullText: text,
          charCount: text.length,
          processName: processName.replace(/\.exe$/i, ''),
          title: sanitizeWindowTitle(windowTitle),
        }

        this.history.unshift(clipItem)
        if (this.history.length > this.maxHistory) {
          this.history.pop()
        }

        if (this.onClipCallback) {
          this.onClipCallback(clipItem)
        }
      } catch {
        // Transient clipboard read lock by another app
      }
    }, 800)
  }

  /**
   * Stops the clipboard polling timer.
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  /**
   * Sets paused state.
   * @param {boolean} paused
   */
  setPaused(paused) {
    this.isPaused = paused
  }

  /**
   * Registers callback for new clipboard items.
   * @param {(item: object) => void} cb
   */
  onClip(cb) {
    this.onClipCallback = cb
  }

  /**
   * Returns copy of the current clipboard history.
   * @returns {Array<object>}
   */
  getHistory() {
    return [...this.history]
  }

  /**
   * Detects sensitive patterns such as API keys, tokens, or credit cards.
   * @param {string} text
   * @returns {boolean}
   */
  isSensitiveContent(text) {
    if (!text) return true
    // High-entropy token or private key markers
    if (/BEGIN (?:[A-Z0-9_-]+ )*(?:PRIVATE )?KEY/i.test(text)) return true
    if (/bearer [a-zA-Z0-9_\-\.]{20,}/i.test(text)) return true
    if (/(ghp_|gho_|xoxb-|sk_live_|AIza)[a-zA-Z0-9_]{16,}/i.test(text)) return true
    // Standard credit card regex
    if (/\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/.test(text.replace(/[\s-]/g, ''))) return true
    return false
  }
}
