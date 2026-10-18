/**
 * REWIND Desktop Ultimate - System-Wide Always-On-Top Time Machine Core
 * Features:
 * - Floating HUD pill (480x46) expandable to full Time Machine dashboard (1100x520).
 * - Global hotkey (Ctrl+Alt+Z) to toggle Time Machine from any app.
 * - Window lifecycle tracking & close recording with full state (CMD scrollback, history, cwd).
 * - Multi-tier point-in-time resurrection with executed-command disclaimer.
 * - 1-Click 5-second GIF moment exporter for sharing.
 * - Instant OCR text indexing and click-to-copy token retrieval.
 * - Ghost Shield & Game/Battery throttling protection.
 * - Privacy-screened clipboard history integration.
 * - 20-second atomic WAL auto-backup engine with crash recovery.
 */

import { app, BrowserWindow, ipcMain, screen, globalShortcut, clipboard, safeStorage } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initWin32, getActiveWindow, sendCtrlZ, isWindowAlive } from './win32.js'
import { UndoEngine } from './undoEngine.js'
import { BackupEngine } from './backupEngine.js'
import { ClipboardEngine } from './clipboardEngine.js'
import { isWindowAllowed, sanitizeWindowTitle } from './security.js'
import { StateCaptureEngine, setStorageKeyProvider } from './stateCapture.js'
import { createKeyProvider } from './keyStore.js'
import { GifExporter } from './gifExporter.js'
import { OcrEngine } from './ocrEngine.js'
import { GameAndBatteryGuard } from './gameGuard.js'
import { StatsEngine } from './statsEngine.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let hudWindow = null
let backupEngine = null
let clipboardEngine = null
let statsEngine = null
let ocrEngine = new OcrEngine()
let gameGuard = new GameAndBatteryGuard()
let lastActiveWindow = null
let isTimeMachineExpanded = false
let isPaused = false
let pauseTimeout = null

const DEFAULT_PAUSE_MINUTES = 15
const MAX_PAUSE_MINUTES = 24 * 60
const MAX_CLIPBOARD_CHARS = 1_000_000
const MAX_LABEL_CHARS = 80

/** Renderer input is untrusted: coerce to a sane number of minutes. */
function sanitizePauseMinutes(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return DEFAULT_PAUSE_MINUTES
  return Math.min(MAX_PAUSE_MINUTES, value)
}

let currentSession = {
  id: `session-${Date.now()}`,
  startedAt: new Date().toISOString(),
  events: [],
}

function createOverlayHUD() {
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width } = primaryDisplay.workAreaSize

  hudWindow = new BrowserWindow({
    width: 480,
    height: 46,
    x: Math.round((width - 480) / 2),
    y: 20,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })

  // Keep HUD hovering over all software windows
  hudWindow.setAlwaysOnTop(true, 'screen-saver')
  hudWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  hudWindow.webContents.on('will-navigate', (e) => e.preventDefault())
  hudWindow.loadFile(path.join(__dirname, 'overlay', 'index.html'))

  hudWindow.on('closed', () => {
    hudWindow = null
  })
}

function setOverlayExpanded(expand) {
  if (!hudWindow || hudWindow.isDestroyed()) return
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width } = primaryDisplay.workAreaSize

  isTimeMachineExpanded = expand

  if (expand) {
    const expandedWidth = Math.min(1100, width - 40)
    const expandedHeight = 520
    const x = Math.round((width - expandedWidth) / 2)
    hudWindow.setBounds({ x, y: 20, width: expandedWidth, height: expandedHeight }, true)
  } else {
    const compactWidth = 480
    const compactHeight = 46
    const x = Math.round((width - compactWidth) / 2)
    hudWindow.setBounds({ x, y: 20, width: compactWidth, height: compactHeight }, true)
  }

  hudWindow.webContents.send('time-machine-state', {
    expanded: isTimeMachineExpanded,
    events: currentSession.events,
    clipboards: clipboardEngine ? clipboardEngine.getHistory() : [],
    isPaused,
  })
}

function toggleTimeMachine() {
  setOverlayExpanded(!isTimeMachineExpanded)
}

let monitorTimeout = null

function scheduleNextMonitorTick(delayMs = 400) {
  if (monitorTimeout) clearTimeout(monitorTimeout)
  monitorTimeout = setTimeout(() => {
    runMonitorCycle()
  }, delayMs)
}

function runMonitorCycle() {
  const startTime = Date.now()
  try {
    if (isPaused) {
      scheduleNextMonitorTick(400)
      return
    }

    const current = getActiveWindow()
    if (!current) {
      scheduleNextMonitorTick(400)
      return
    }

    // Ignore our own windows. Matching on the process id instead of the title:
    // the old `title.includes('REWIND')` also hid any window that merely had
    // "Rewind" in its title, such as an editor open on this very project.
    if (current.pid === process.pid) {
      scheduleNextMonitorTick(400)
      return
    }

    // Ghost Shield & Game / Battery Throttling Check
    const guardCheck = gameGuard.shouldSuppressCapture({
      processName: current.processName,
      title: current.title,
    })
    if (guardCheck.suppress) {
      scheduleNextMonitorTick(guardCheck.throttleMs || 800)
      return
    }

    // Security & Privacy Denylist Check
    if (!isWindowAllowed(current.processName, current.title)) {
      scheduleNextMonitorTick(400)
      return
    }

    // Check for window change or window closure
    if (!lastActiveWindow || lastActiveWindow.hwnd !== current.hwnd) {
      const sanitizedTitle = sanitizeWindowTitle(current.title)

      // If the previous window closed/switched, record closure with full state if applicable
      if (lastActiveWindow && lastActiveWindow.hwnd !== current.hwnd && !isWindowAlive(lastActiveWindow.hwnd)) {
        let stateSummary = null
        let statePayload = null

        try {
          const captured = StateCaptureEngine.captureState({
            processName: lastActiveWindow.processName,
            exePath: lastActiveWindow.exePath,
            title: lastActiveWindow.title,
            bounds: lastActiveWindow.bounds,
            cwd: process.env.USERPROFILE || 'C:\\',
            buffer: '',
            history: [],
          })
          stateSummary = captured.summary
          statePayload = captured
        } catch {
          // fallback
        }

        const closeEvent = {
          id: `evt-close-${Date.now()}`,
          timestamp: Date.now(),
          kind: 'window-closed',
          processName: lastActiveWindow.processName,
          exePath: lastActiveWindow.exePath,
          title: sanitizeWindowTitle(lastActiveWindow.title),
          bounds: lastActiveWindow.bounds,
          hasFullState: !!statePayload,
          stateSummary,
          statePayload,
          description: `Closed ${lastActiveWindow.processName}`,
        }

        // Index into OCR search
        ocrEngine.indexSnapshot(closeEvent.id, `${closeEvent.processName} ${closeEvent.title} ${stateSummary || ''}`, closeEvent)

        currentSession.events.unshift(closeEvent)
        if (currentSession.events.length > 200) currentSession.events.pop()
        backupEngine?.markDirty(currentSession)
      }

      // Record focus change
      const focusEvent = {
        id: `evt-focus-${Date.now()}`,
        timestamp: Date.now(),
        kind: 'window-focus',
        processName: current.processName,
        exePath: current.exePath,
        title: sanitizedTitle,
        bounds: current.bounds,
        isHung: !!current.isHung,
        description: current.isHung
          ? `Focused (Unresponsive) ${current.processName}`
          : `Focused ${current.processName}: ${sanitizedTitle}`,
      }

      // Index into OCR search
      ocrEngine.indexSnapshot(focusEvent.id, `${focusEvent.processName} ${focusEvent.title}`, focusEvent)

      currentSession.events.unshift(focusEvent)
      if (currentSession.events.length > 200) currentSession.events.pop()
      backupEngine?.markDirty(currentSession)
      statsEngine?.recordWindowSwitch(current.processName)
      lastActiveWindow = current

      // Update compact HUD
      if (hudWindow && !hudWindow.isDestroyed()) {
        hudWindow.webContents.send('active-window-updated', {
          processName: current.processName,
          title: sanitizedTitle || current.processName,
          isHung: !!current.isHung,
        })
        if (isTimeMachineExpanded) {
          hudWindow.webContents.send('time-machine-state', {
            expanded: true,
            events: currentSession.events,
            clipboards: clipboardEngine ? clipboardEngine.getHistory() : [],
            isPaused,
          })
        }
      }
    }
  } catch {
    // transient window switch error
  } finally {
    // Adaptive rate control: if cycle was slow, compensate next interval
    const cycleDuration = Date.now() - startTime
    const targetDelay = Math.max(250, 400 - cycleDuration)
    scheduleNextMonitorTick(targetDelay)
  }
}

function startWindowMonitor() {
  scheduleNextMonitorTick(400)
}

// A second instance would double-capture and fight over the same files.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
}
app.on('second-instance', () => {
  if (hudWindow && !hudWindow.isDestroyed()) hudWindow.show()
})

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return
  initWin32()
  setStorageKeyProvider(createKeyProvider({ safeStorage, dir: app.getPath('userData') }))

  // Initialize 20-second atomic WAL auto-backup
  const storageDir = path.join(app.getPath('userData'), 'rewind_backups')
  backupEngine = new BackupEngine(storageDir, 20000)

  const recovered = backupEngine.restoreLatest()
  if (recovered && recovered.events?.length > 0) {
    console.log(`[REWIND Desktop] Recovered ${recovered.events.length} events from crash backup.`)
    currentSession = recovered
  }

  backupEngine.onSave(() => {
    if (hudWindow && !hudWindow.isDestroyed()) {
      hudWindow.webContents.send('backup-saved')
    }
  })
  backupEngine.start()

  // Initialize Productivity & Focus Stats Engine
  const statsDir = path.join(app.getPath('userData'), 'rewind_stats')
  statsEngine = new StatsEngine(statsDir, 30)

  // Initialize privacy-screened Clipboard Engine
  clipboardEngine = new ClipboardEngine(50)
  clipboardEngine.start(() => ({
    processName: lastActiveWindow?.processName,
    title: lastActiveWindow?.title,
  }))

  clipboardEngine.onClip((clip) => {
    if (hudWindow && !hudWindow.isDestroyed() && isTimeMachineExpanded) {
      hudWindow.webContents.send('new-clipboard-item', clip)
    }
  })

  // Launch always-on-top HUD
  createOverlayHUD()
  startWindowMonitor()

  // Register Global Shortcut: Ctrl+Alt+Z
  try {
    globalShortcut.register('CommandOrControl+Alt+Z', () => {
      toggleTimeMachine()
    })
  } catch (err) {
    console.warn('[REWIND Hotkey] Could not register Ctrl+Alt+Z:', err)
  }

  // IPC listener for Toggle Time Machine
  ipcMain.on('toggle-time-machine', () => {
    toggleTimeMachine()
  })

  // IPC listener for Fetching Timeline Data
  ipcMain.on('get-timeline-data', (event) => {
    event.reply('time-machine-state', {
      expanded: isTimeMachineExpanded,
      events: currentSession.events,
      clipboards: clipboardEngine ? clipboardEngine.getHistory() : [],
      isPaused,
    })
  })

  // IPC listener for Undo with focus switch verification & feedback
  ipcMain.on('trigger-undo', async () => {
    if (lastActiveWindow?.hwnd) {
      const success = await sendCtrlZ(lastActiveWindow.hwnd, 500)
      if (success) {
        statsEngine?.recordRescue('undo')
      }
      if (hudWindow && !hudWindow.isDestroyed()) {
        hudWindow.webContents.send('undo-result', {
          success,
          processName: lastActiveWindow.processName,
          title: lastActiveWindow.title,
        })
      }
    } else {
      if (hudWindow && !hudWindow.isDestroyed()) {
        hudWindow.webContents.send('undo-result', {
          success: false,
          reason: 'no-active-window',
        })
      }
    }
  })

  // IPC listener for Restoring a past moment / Deep State Resurrection
  ipcMain.on('restore-moment', async (event, requested) => {
    // Never act on renderer-supplied payloads: resolve the moment from our own timeline by id.
    const eventSnapshot = currentSession.events.find((e) => e.id === requested?.id)
    if (!eventSnapshot) {
      event.reply('restore-moment-result', { success: false, error: 'Unknown moment' })
      return
    }
    // If full state payload is available, use StateCaptureEngine with disclaimer
    if (eventSnapshot?.statePayload) {
      const result = await StateCaptureEngine.resurrectState(eventSnapshot.statePayload)
      if (result?.success) statsEngine?.recordRescue('terminal_resurrect')
      event.reply('restore-moment-result', result)
      return
    }

    // If terminal without blob, resurrect with disclaimer
    if (eventSnapshot && StateCaptureEngine.isTerminal(eventSnapshot.processName)) {
      const result = await StateCaptureEngine.resurrectState({
        appType: 'terminal',
        processName: eventSnapshot.processName,
        exePath: eventSnapshot.exePath,
        cwd: process.env.USERPROFILE || 'C:\\',
      })
      if (result?.success) statsEngine?.recordRescue('terminal_resurrect')
      event.reply('restore-moment-result', result)
      return
    }

    // Default window resurrection & repositioning
    const result = await UndoEngine.restoreMoment(eventSnapshot)
    event.reply('restore-moment-result', result)
  })

  // IPC listener for Exporting 5-Second Moment as GIF
  ipcMain.on('export-moment-gif', (event) => {
    try {
      const downloadsDir = app.getPath('downloads') || process.cwd()
      const exportResult = GifExporter.export5SecondMoment(currentSession.events, downloadsDir)
      event.reply('export-moment-gif-result', {
        success: true,
        ...exportResult,
      })
    } catch (err) {
      event.reply('export-moment-gif-result', {
        success: false,
        error: err.message,
      })
    }
  })

  // IPC listener for OCR text search
  ipcMain.on('search-ocr-text', (event, query) => {
    const results = ocrEngine.search(query)
    event.reply('search-ocr-text-result', results)
  })

  // IPC listener for OCR click-to-copy tokens
  ipcMain.on('get-ocr-tokens', (event, snapshotId) => {
    const tokens = ocrEngine.getTokens(snapshotId)
    event.reply('get-ocr-tokens-result', { snapshotId, tokens })
  })

  // IPC listener for Copying snippet to clipboard
  ipcMain.on('copy-to-clipboard', (_event, text) => {
    // Untrusted renderer input: a non-string made clipboard.writeText throw
    // inside the main process, which Electron surfaces as a crash dialog.
    if (typeof text === 'string' && text.length > 0 && text.length <= MAX_CLIPBOARD_CHARS) {
      clipboard.writeText(text)
      statsEngine?.recordRescue('clipboard_restore')
    }
  })

  // IPC listeners for Productivity Stats
  ipcMain.on('get-productivity-stats', (event) => {
    event.reply('productivity-stats-result', statsEngine ? statsEngine.getSummary() : null)
  })

  ipcMain.on('reset-productivity-stats', (event) => {
    statsEngine?.reset()
    event.reply('productivity-stats-result', statsEngine?.getSummary())
  })

  // IPC listeners for Checkpoints & Backup Management
  ipcMain.on('get-checkpoints', (event) => {
    event.reply('checkpoints-list-result', backupEngine ? backupEngine.listCheckpoints() : [])
  })

  ipcMain.on('create-checkpoint', (event, label) => {
    try {
      const safeLabel = typeof label === 'string' && label.trim() ? label.trim().slice(0, MAX_LABEL_CHARS) : 'Manual Checkpoint'
      const chk = backupEngine.createCheckpoint(safeLabel, currentSession)
      event.reply('checkpoint-created-result', {
        success: true,
        checkpoint: chk,
        checkpoints: backupEngine.listCheckpoints(),
      })
    } catch (err) {
      event.reply('checkpoint-created-result', { success: false, error: err.message })
    }
  })

  ipcMain.on('restore-checkpoint', (event, id) => {
    try {
      const session = backupEngine.restoreCheckpoint(id)
      if (session) {
        currentSession = session
        backupEngine.markDirty(currentSession)
        event.reply('restore-checkpoint-result', {
          success: true,
          eventCount: currentSession.events?.length || 0,
        })
        if (hudWindow && !hudWindow.isDestroyed()) {
          hudWindow.webContents.send('time-machine-state', {
            expanded: isTimeMachineExpanded,
            events: currentSession.events,
            clipboards: clipboardEngine ? clipboardEngine.getHistory() : [],
            isPaused,
          })
        }
      } else {
        event.reply('restore-checkpoint-result', { success: false, error: 'Checkpoint not found' })
      }
    } catch (err) {
      event.reply('restore-checkpoint-result', { success: false, error: err.message })
    }
  })

  ipcMain.on('delete-checkpoint', (event, id) => {
    const success = backupEngine ? backupEngine.deleteCheckpoint(id) : false
    event.reply('delete-checkpoint-result', {
      success,
      checkpoints: backupEngine ? backupEngine.listCheckpoints() : [],
    })
  })

  ipcMain.on('export-backup-bundle', (event) => {
    try {
      const downloadsDir = app.getPath('downloads') || process.cwd()
      const targetPath = path.join(downloadsDir, `rewind-backup-${Date.now()}.rewind.backup`)
      const res = backupEngine.exportBackupBundle(targetPath)
      event.reply('export-backup-bundle-result', res)
    } catch (err) {
      event.reply('export-backup-bundle-result', { success: false, error: err.message })
    }
  })

  // IPC listener for Privacy Pause
  ipcMain.on('toggle-privacy-pause', (event, rawMinutes) => {
    const minutes = sanitizePauseMinutes(rawMinutes)
    if (isPaused) {
      isPaused = false
      if (pauseTimeout) clearTimeout(pauseTimeout)
      pauseTimeout = null
    } else {
      isPaused = true
      if (pauseTimeout) clearTimeout(pauseTimeout)
      pauseTimeout = setTimeout(() => {
        isPaused = false
        pauseTimeout = null
        // Auto-resume must also wake the clipboard engine; before, it stayed
        // paused forever after the timer fired.
        if (clipboardEngine) clipboardEngine.setPaused(false)
        if (hudWindow && !hudWindow.isDestroyed()) {
          hudWindow.webContents.send('pause-state-changed', { isPaused: false })
        }
      }, minutes * 60 * 1000)
    }

    if (clipboardEngine) clipboardEngine.setPaused(isPaused)
    event.reply('pause-state-changed', { isPaused })
  })
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

app.on('window-all-closed', () => {
  if (backupEngine) backupEngine.stop()
  if (clipboardEngine) clipboardEngine.stop()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
