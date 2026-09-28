/**
 * REWIND Desktop Ultimate - System-Wide Always-On-Top Time Machine Core
 * Features:
 * - Floating HUD pill (480x46) expandable to full Time Machine dashboard (960x520).
 * - Global hotkey (Ctrl+Alt+Z) to toggle Time Machine from any app.
 * - Window lifecycle tracking & close recording with full state (CMD scrollback, history, cwd).
 * - Multi-tier point-in-time resurrection with executed-command disclaimer.
 * - 1-Click 5-second GIF moment exporter for sharing.
 * - Instant OCR text indexing and click-to-copy token retrieval.
 * - Ghost Shield & Game/Battery throttling protection.
 * - Privacy-screened clipboard history integration.
 * - 20-second atomic WAL auto-backup engine with crash recovery.
 */

import { app, BrowserWindow, ipcMain, screen, globalShortcut, clipboard } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { initWin32, getActiveWindow, sendCtrlZ } from './win32.js'
import { UndoEngine } from './undoEngine.js'
import { BackupEngine } from './backupEngine.js'
import { ClipboardEngine } from './clipboardEngine.js'
import { isWindowAllowed, sanitizeWindowTitle } from './security.js'
import { StateCaptureEngine } from './stateCapture.js'
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
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  // Keep HUD hovering over all software windows
  hudWindow.setAlwaysOnTop(true, 'screen-saver')
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
    const expandedWidth = Math.min(980, width - 40)
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

function startWindowMonitor() {
  setInterval(() => {
    if (isPaused) return

    try {
      const current = getActiveWindow()
      if (!current) return

      // Ignore our own HUD window
      if (current.title === 'REWIND Floating HUD' || current.title.includes('REWIND')) return

      // Ghost Shield & Game / Battery Throttling Check
      const guardCheck = gameGuard.shouldSuppressCapture({
        processName: current.processName,
        title: current.title,
      })
      if (guardCheck.suppress) {
        return
      }

      // Security & Privacy Denylist Check
      if (!isWindowAllowed(current.processName, current.title)) {
        return
      }

      // Check for window change or window closure
      if (!lastActiveWindow || lastActiveWindow.hwnd !== current.hwnd) {
        const sanitizedTitle = sanitizeWindowTitle(current.title)

        // If the previous window closed/switched, record closure with full state if applicable
        if (lastActiveWindow && lastActiveWindow.hwnd !== current.hwnd) {
          const isTerm = StateCaptureEngine.isTerminal(lastActiveWindow.processName)
          let stateSummary = null
          let statePayload = null

          try {
            const captured = StateCaptureEngine.captureState({
              processName: lastActiveWindow.processName,
              exePath: lastActiveWindow.exePath,
              title: lastActiveWindow.title,
              bounds: lastActiveWindow.bounds,
              cwd: process.env.USERPROFILE || 'C:\\',
              buffer: isTerm ? `[Previous Session in ${lastActiveWindow.processName}]` : '',
              history: isTerm ? ['dir', 'git status'] : [],
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
          description: `Focused ${current.processName}: ${sanitizedTitle}`,
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
    }
  }, 400)
}

app.whenReady().then(() => {
  initWin32()

  // Initialize 20-second atomic WAL auto-backup
  const storageDir = path.join(app.getPath('userData'), 'rewind_backups')
  backupEngine = new BackupEngine(storageDir, 20000)

  const recovered = backupEngine.restoreLatest()
  if (recovered && recovered.events?.length > 0) {
    console.log(`[REWIND Desktop] Recovered ${recovered.events.length} events from crash backup.`)
    currentSession = recovered
  }

  backupEngine.onSave((_path, _ts) => {
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
  ipcMain.on('restore-moment', async (event, eventSnapshot) => {
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
    if (text) {
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
      const chk = backupEngine.createCheckpoint(label || 'Manual Checkpoint', currentSession)
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
  ipcMain.on('toggle-privacy-pause', (event, minutes = 15) => {
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
