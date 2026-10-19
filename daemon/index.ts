/**
 * REWIND Headless Daemon Orchestrator
 * Background service that coordinates:
 *   - TimelineDatabase (SQLite + FTS5)
 *   - RPC Server (TCP + Named Pipe) and the loopback HTTP bridge for the dashboard
 *   - Git Branch Watcher
 *   - Capture loop (Win32 PrintWindow, Ghost Shield filtered)
 *   - WAL checkpoint + retention loop
 *   - v5.0 workspace resurrection (`timeline.resurrectWorkspace`)
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { TimelineDatabase, type DbMoment } from './db/timelineDb.js'
import { RpcServer, type MethodHandler } from './rpc/rpcServer.js'
import { HttpBridge } from './rpc/httpBridge.js'
import { generateAuthToken, writeAuthToken } from './rpc/auth.js'
import { GitWatcher } from './git/gitWatcher.js'
import { WindowCaptureEngine } from './capture/windowCapture.js'
import { METHOD_NOT_FOUND } from './rpc/protocol.js'
import { sanitizeWindowTitle } from './privacy.js'
import { WorkspaceResurrector } from './resurrect/workspaceResurrector.js'
import { createDefaultLauncher } from './resurrect/launcher.js'
import { WindowGeometryRestorer, type WindowDriver } from './resurrect/geometry/windowGeometryRestorer.js'
import { createWin32WindowDriver } from './resurrect/geometry/win32Driver.js'
import { PlaywrightExporter } from './macros/playwright/playwrightExporter.js'
import { PowerShellExporter, type PowerShellMacroStep } from './macros/devops/powershellExporter.js'
import { FocusEngine } from './analytics/focusEngine.js'
import { OllamaConnector } from './ai/ollamaConnector.js'
import type { MacroBrowserEvent } from './macros/types.js'
import type { Launcher } from './resurrect/types.js'

export interface DaemonConfig {
  dbPath?: string
  rpcPort?: number
  /** Port for the dashboard HTTP bridge; `null` disables it. */
  httpPort?: number | null
  pipeName?: string
  captureIntervalMs?: number
  walIntervalMs?: number
  gitRepoRoot?: string
  /** Folders searched when resurrecting editor files named in window titles. */
  workspaceRoots?: string[]
  /** Moments older than this are deleted. 0 keeps everything. Default 30. */
  retentionDays?: number
  /** Injectable for tests. */
  launcher?: Launcher
  windowDriver?: WindowDriver | null
}

function defaultDbPath(): string {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  return path.join(base, 'Rewind', 'timeline.db')
}

function defaultWorkspaceRoots(repoRoot: string): string[] {
  const fromEnv = (process.env.REWIND_WORKSPACE_ROOTS ?? '').split(path.delimiter).map((p) => p.trim()).filter(Boolean)
  return [...new Set([...fromEnv, repoRoot, path.dirname(repoRoot)])]
}

/** Coerce an untrusted RPC number into [min, max]; undefined when absent/invalid. */
function boundedNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(max, Math.max(min, value))
}

function rowToDbMoment(row: Record<string, unknown>): DbMoment {
  return {
    id: String(row.id),
    timestamp: Number(row.timestamp),
    appName: String(row.app_name ?? ''),
    windowTitle: String(row.window_title ?? ''),
    processPath: typeof row.process_path === 'string' ? row.process_path : undefined,
    pid: typeof row.pid === 'number' ? row.pid : undefined,
    boundsX: typeof row.bounds_x === 'number' ? row.bounds_x : undefined,
    boundsY: typeof row.bounds_y === 'number' ? row.bounds_y : undefined,
    boundsW: typeof row.bounds_w === 'number' ? row.bounds_w : undefined,
    boundsH: typeof row.bounds_h === 'number' ? row.bounds_h : undefined,
    phash: typeof row.phash === 'string' ? row.phash : undefined,
    screenshotPath: typeof row.screenshot_path === 'string' ? row.screenshot_path : undefined,
    isClosed: typeof row.is_closed === 'number' ? row.is_closed : undefined,
  }
}

const HOUR_MS = 60 * 60 * 1000

export class RewindDaemon {
  private readonly config: Required<Omit<DaemonConfig, 'launcher' | 'windowDriver' | 'httpPort'>> & {
    httpPort: number | null
    launcher?: Launcher
    windowDriver?: WindowDriver | null
  }
  private db: TimelineDatabase | null = null
  private rpc: RpcServer | null = null
  private http: HttpBridge | null = null
  private gitWatcher: GitWatcher | null = null
  private captureEngine: WindowCaptureEngine | null = null
  private captureTimer: ReturnType<typeof setInterval> | null = null
  private walTimer: ReturnType<typeof setInterval> | null = null
  private retentionTimer: ReturnType<typeof setInterval> | null = null
  private pauseTimer: ReturnType<typeof setTimeout> | null = null
  private resurrector: WorkspaceResurrector | null = null
  private capturing = false
  private paused = false
  private authToken = ''
  private startedAt = 0
  private lastPurgedCount = 0

  constructor(config: DaemonConfig = {}) {
    const gitRepoRoot = config.gitRepoRoot ?? process.cwd()
    this.config = {
      dbPath: config.dbPath ?? defaultDbPath(),
      rpcPort: config.rpcPort ?? 48291,
      httpPort: config.httpPort === undefined ? 48292 : config.httpPort,
      pipeName: config.pipeName ?? '\\\\.\\pipe\\rewind-daemon-rpc',
      captureIntervalMs: config.captureIntervalMs ?? 2000,
      walIntervalMs: config.walIntervalMs ?? 20000,
      gitRepoRoot,
      workspaceRoots: config.workspaceRoots ?? defaultWorkspaceRoots(gitRepoRoot),
      retentionDays: config.retentionDays ?? 30,
      launcher: config.launcher,
      windowDriver: config.windowDriver,
    }
  }

  /** Start the daemon: database → RPC → auth token → git → capture → maintenance. */
  async start(): Promise<void> {
    // 1. Ensure data directory exists
    const dbDir = path.dirname(this.config.dbPath)
    fs.mkdirSync(dbDir, { recursive: true })

    // 2. Initialize SQLite timeline database
    this.db = new TimelineDatabase(this.config.dbPath)

    try {
      // 3. Create & start RPC server. A fresh token is minted now but only
      //    written to disk AFTER the port is ours: a second daemon that fails
      //    with EADDRINUSE used to overwrite the running daemon's token file
      //    first, locking every client out.
      this.authToken = generateAuthToken()
      const methodHandler: MethodHandler = (method, params) => this.handleRpcMethod(method, params)
      this.rpc = new RpcServer({
        port: this.config.rpcPort,
        pipeName: this.config.pipeName,
        authToken: this.authToken,
        onMethod: methodHandler,
      })
      await this.rpc.start()

      // 4. Dashboard HTTP bridge. Optional: a busy port must not take the daemon down.
      if (this.config.httpPort !== null) {
        const bridge = new HttpBridge({ port: this.config.httpPort, authToken: this.authToken, onMethod: methodHandler })
        try {
          await bridge.start()
          this.http = bridge
        } catch (err) {
          console.warn(`[REWIND] Dashboard HTTP bridge disabled: ${err instanceof Error ? err.message : String(err)}`)
        }
      }

      writeAuthToken(this.authToken)
    } catch (err) {
      // Do not leak a half-started daemon (open DB handle, bound port).
      if (this.http) { await this.http.stop(); this.http = null }
      if (this.rpc) { await this.rpc.stop(); this.rpc = null }
      this.db.close()
      this.db = null
      throw err
    }

    // 5. Initialize git watcher
    this.gitWatcher = new GitWatcher(this.config.gitRepoRoot)

    // 6. Initialize native window capture engine
    this.captureEngine = new WindowCaptureEngine()

    // 7. Start capture loop with visual change detection
    this.captureTimer = setInterval(() => { void this.captureTick() }, this.config.captureIntervalMs)

    // 8. Maintenance: fold the SQLite WAL on the configured cadence, purge old data hourly.
    this.walTimer = setInterval(() => {
      try { this.db?.checkpoint() } catch { /* best effort */ }
    }, this.config.walIntervalMs)
    this.runRetention()
    this.retentionTimer = setInterval(() => this.runRetention(), HOUR_MS)

    this.startedAt = Date.now()
    console.log(`↶ REWIND Daemon started on port ${this.config.rpcPort}`)
    console.log(`  Database: ${this.config.dbPath}`)
    console.log(`  Pipe: ${this.config.pipeName}`)
    if (this.http) console.log(`  Dashboard bridge: http://127.0.0.1:${this.config.httpPort}`)
  }

  /** Gracefully shut down all subsystems in reverse order. */
  async stop(): Promise<void> {
    if (this.walTimer) { clearInterval(this.walTimer); this.walTimer = null }
    if (this.captureTimer) { clearInterval(this.captureTimer); this.captureTimer = null }
    if (this.retentionTimer) { clearInterval(this.retentionTimer); this.retentionTimer = null }
    if (this.pauseTimer) { clearTimeout(this.pauseTimer); this.pauseTimer = null }
    if (this.captureEngine) { this.captureEngine = null }
    if (this.gitWatcher) { this.gitWatcher.stopWatching(); this.gitWatcher = null }
    if (this.http) { await this.http.stop(); this.http = null }
    if (this.rpc) { await this.rpc.stop(); this.rpc = null }
    if (this.db) { this.db.close(); this.db = null }
    this.resurrector = null
    this.startedAt = 0
    console.log('↶ REWIND Daemon stopped.')
  }

  private async captureTick(): Promise<void> {
    // setInterval does not wait for async work: skip a tick while the last one is still running.
    if (this.capturing || this.paused || !this.captureEngine || !this.db) return
    this.capturing = true
    try {
      const frame = await this.captureEngine.captureActiveWindow()
      if (frame && frame.isChanged && this.db) {
        const gitCtx = this.gitWatcher?.getContext()
        const realTitle = sanitizeWindowTitle(frame.windowTitle)
        this.db.insertMoment({
          id: frame.id,
          timestamp: frame.timestamp,
          appName: frame.processName || 'ActiveWindow',
          // A real title is stored verbatim so editors/terminals can be resurrected from it.
          windowTitle: realTitle || (gitCtx ? `[${gitCtx.branch}] Window Moment` : 'Window Moment'),
          processPath: frame.processPath,
          pid: frame.pid,
          boundsX: frame.x,
          boundsY: frame.y,
          boundsW: frame.width,
          boundsH: frame.height,
          phash: frame.phash,
          screenshotPath: frame.screenshotPath,
        })
      }
    } catch {
      // transient capture error
    } finally {
      this.capturing = false
    }
  }

  /** Delete moments (and their screenshots) older than the retention window. */
  private runRetention(): { removed: number } {
    if (!this.db || this.config.retentionDays <= 0) return { removed: 0 }
    try {
      const { removed, screenshotPaths } = this.db.purgeOlderThan(Date.now() - this.config.retentionDays * 24 * HOUR_MS)
      for (const file of screenshotPaths) {
        try { fs.rmSync(file, { force: true }) } catch { /* already gone */ }
      }
      this.lastPurgedCount = removed
      return { removed }
    } catch {
      // retention must never take the daemon down
      return { removed: 0 }
    }
  }

  private getResurrector(): WorkspaceResurrector {
    if (!this.resurrector) {
      const db = this.db
      if (!db) throw { code: -32603, message: 'Database not available' }
      // Created lazily so merely starting the daemon never loads Win32 bindings.
      const driver = this.config.windowDriver === undefined ? createWin32WindowDriver() : this.config.windowDriver
      this.resurrector = new WorkspaceResurrector({
        getMomentById: (id) => db.getMomentById(id),
        getMoments: (options) => db.getMoments(options),
        getBrowserEventsBetween: (since, until) => db.getBrowserEventsBetween(since, until),
        launcher: this.config.launcher ?? createDefaultLauncher(),
        geometry: driver ? new WindowGeometryRestorer(driver) : null,
        workspaceRoots: this.config.workspaceRoots,
      })
    }
    return this.resurrector
  }

  /** JSON-RPC method dispatcher. */
  private async handleRpcMethod(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'daemon.status':
        return {
          running: true,
          paused: this.paused,
          uptime: this.startedAt > 0 ? Math.round((Date.now() - this.startedAt) / 1000) : 0,
          // COUNT(*): the old code loaded rows and, because getMoments defaults to 50, never reported more than 50.
          momentCount: this.db ? this.db.countMoments() : 0,
          dbPath: this.config.dbPath,
        }

      case 'daemon.pause': {
        // `paused: true|false` sets the state; with no such param it toggles (legacy behaviour).
        const target = typeof params.paused === 'boolean' ? params.paused : !this.paused
        const minutes = boundedNumber(params.minutes, 1, 24 * 60)
        this.paused = target
        // Always drop the old auto-resume timer; a stale one used to un-pause a later, separate pause early.
        if (this.pauseTimer) { clearTimeout(this.pauseTimer); this.pauseTimer = null }
        if (this.paused && minutes !== undefined) {
          this.pauseTimer = setTimeout(() => { this.paused = false; this.pauseTimer = null }, minutes * 60 * 1000)
        }
        return { paused: this.paused, resumesIn: this.paused && minutes !== undefined ? `${minutes} minutes` : null }
      }

      case 'daemon.stop':
        // Schedule stop after responding
        setTimeout(() => void this.stop(), 100)
        return { stopping: true }

      case 'timeline.getRecent': {
        if (!this.db) return []
        const limit = typeof params.limit === 'number' ? params.limit : 50
        const since = typeof params.since === 'number' ? params.since : undefined
        return this.db.getMoments({ limit, since })
      }

      case 'timeline.search': {
        if (!this.db) return []
        const query = typeof params.query === 'string' ? params.query.slice(0, 500) : ''
        const limit = boundedNumber(params.limit, 1, 200) ?? 20
        return this.db.searchFts(query, limit)
      }

      case 'timeline.undo': {
        // Zero-trust: validate momentId; resolve target exclusively from the DB, not from the renderer.
        const rawUndoId = typeof params.momentId === 'string' ? params.momentId : ''
        const undoMomentId = rawUndoId.replace(/[^a-zA-Z0-9_-]/g, '')
        if (!undoMomentId) {
          return { undone: false, reason: 'No valid momentId provided' }
        }
        if (!this.db) {
          return { undone: false, reason: 'Database not ready' }
        }
        // Resolve from internal timeline — never trust the renderer's copy of the moment.
        const undoRows = this.db.getMoments({ limit: 2000 })
        const undoRow = undoRows.find((r) => String(r.id) === undoMomentId)
        if (!undoRow) {
          return { undone: false, reason: `Moment ${undoMomentId} not found in timeline` }
        }
        const undoTarget = rowToDbMoment(undoRow)

        // Synthetic Ctrl+Z via WScript.Shell — Windows only, no global keyboard hook installed.
        // AppActivate focuses the window by title; SendKeys('^z') dispatches the keystroke.
        if (process.platform !== 'win32') {
          return {
            undone: false,
            reason: 'Undo via daemon requires Windows; use the desktop overlay on other platforms',
            momentId: undoMomentId,
            targetApp: undoTarget.appName,
          }
        }
        try {
          const { spawn } = await import('node:child_process')
          // Escape single quotes for PowerShell string literal
          const safeTitle = undoTarget.windowTitle.replace(/'/g, "''")
          await new Promise<void>((resolve, reject) => {
            const ps = spawn(
              'powershell.exe',
              [
                '-NonInteractive', '-NoProfile', '-WindowStyle', 'Hidden',
                '-Command',
                `$ws = New-Object -COM WScript.Shell; $ws.AppActivate('${safeTitle}'); Start-Sleep -Milliseconds 150; $ws.SendKeys('^z')`,
              ],
              { detached: true, stdio: 'ignore' },
            )
            const psTimer = setTimeout(() => resolve(), 3000)
            ps.on('error', (err) => { clearTimeout(psTimer); reject(err) })
            ps.on('close', (code) => {
              clearTimeout(psTimer)
              if (code === 0) {
                resolve()
              } else {
                reject(new Error(`ps exit ${code}`))
              }
            })
            ps.unref()
          })
          return { undone: true, momentId: undoMomentId, targetApp: undoTarget.appName, windowTitle: undoTarget.windowTitle }
        } catch (err) {
          return {
            undone: false,
            reason: err instanceof Error ? err.message : 'Unknown PowerShell error',
            momentId: undoMomentId,
            targetApp: undoTarget.appName,
          }
        }
      }

      case 'timeline.resurrectWorkspace':
        // Only a moment id (and flags) is read from params; see WorkspaceResurrector.
        return this.getResurrector().resurrect({
          momentId: params.momentId,
          dryRun: params.dryRun,
          windowMs: params.windowMs,
          maxSteps: params.maxSteps,
        })

      case 'git.context':
        return this.gitWatcher ? this.gitWatcher.getContext() : { branch: 'unknown', commitHash: '0000000', dirtyFileCount: 0, repoRoot: '.' }

      case 'provenance.export': {
        // Zero-trust: validate momentId from params.
        const rawProvId = typeof params.momentId === 'string' ? params.momentId : ''
        const provMomentId = rawProvId.replace(/[^a-zA-Z0-9_-]/g, '')
        const provDepth = typeof params.depth === 'number' ? Math.min(Math.max(1, Math.round(params.depth)), 50) : 10

        if (!this.db) {
          return { schemaVersion: '1.0.0', exportedAt: Date.now(), error: 'Database not ready', chain: [] }
        }

        const provRows = this.db.getMoments({ limit: 2000 })

        let anchorIdx = 0
        if (provMomentId) {
          const idx = provRows.findIndex((r) => String(r.id) === provMomentId)
          if (idx === -1) {
            return { schemaVersion: '1.0.0', exportedAt: Date.now(), momentId: provMomentId, error: `Moment ${provMomentId} not found`, chain: [] }
          }
          anchorIdx = idx
        }

        // Gather `depth` moments centred around the anchor (half before, half after).
        const half = Math.floor(provDepth / 2)
        const sliceStart = Math.max(0, anchorIdx - half)
        const sliceEnd = Math.min(provRows.length, sliceStart + provDepth)

        const chain = provRows.slice(sliceStart, sliceEnd).map((r) => ({
          id: String(r.id),
          timestamp: Number(r.timestamp),
          appName: String(r.app_name ?? ''),
          windowTitle: String(r.window_title ?? ''),
          gitBranch: typeof r.git_branch === 'string' ? r.git_branch : null,
          phash: typeof r.phash === 'string' ? r.phash : null,
          // Truncate OCR text to avoid oversized exports
          ocrText: typeof r.ocr_text === 'string' ? r.ocr_text.slice(0, 200) : null,
        }))

        return {
          schemaVersion: '1.0.0',
          exportedAt: Date.now(),
          momentId: provMomentId || chain[0]?.id || null,
          depth: chain.length,
          chain,
        }
      }

      case 'timeline.captureNow': {
        if (!this.captureEngine) return { captured: false, error: 'Capture engine not running' }
        const frame = await this.captureEngine.captureActiveWindow()
        return { captured: !!frame, frame }
      }

      case 'macro.export': {
        const format = params.format === 'powershell' ? 'powershell' : 'playwright'
        let events: MacroBrowserEvent[] = []
        if (Array.isArray(params.events)) {
          events = params.events as MacroBrowserEvent[]
        } else if (this.db) {
          const since = typeof params.since === 'number' ? params.since : Date.now() - 3600000
          const until = typeof params.until === 'number' ? params.until : Date.now()
          const rows = this.db.getBrowserEventsBetween(since, until, 500)
          events = rows.map((r) => ({
            id: r.id,
            timestamp: r.timestamp,
            kind: r.eventKind,
            url: r.url,
            selector: r.selector,
            scrollX: r.scrollX,
            scrollY: r.scrollY,
          }))
        }
        if (format === 'playwright') {
          return PlaywrightExporter.export(events, {
            testName: typeof params.testName === 'string' ? params.testName : undefined,
            defaultTimeoutMs: typeof params.timeoutMs === 'number' ? params.timeoutMs : undefined,
            generateAssertions: Boolean(params.generateAssertions),
          })
        }

        if (format === 'powershell') {
          const steps = (Array.isArray(params.steps) ? params.steps : []) as PowerShellMacroStep[]
          return PowerShellExporter.export(steps, {
            scriptName: typeof params.scriptName === 'string' ? params.scriptName : undefined,
            elevated: Boolean(params.elevated),
            stopOnError: params.stopOnError !== false,
          })
        }

        throw { code: -32602, message: `Unsupported export format "${format}"` }
      }

      case 'analytics.focusReport': {
        if (!this.db) {
          return FocusEngine.analyze([])
        }
        const limit = typeof params.limit === 'number' ? params.limit : 500
        const moments = this.db.getMoments({ limit }).map(rowToDbMoment)
        return FocusEngine.analyze(moments)
      }

      case 'analytics.telemetryStats': {
        let focusScore = 100
        let contextSwitchesPerHour = 0
        let activeSessionDurationMinutes = 0
        const momentsRecorded = this.db ? this.db.countMoments() : 0

        if (this.db) {
          const moments = this.db.getMoments({ limit: 100 }).map(rowToDbMoment)
          const report = FocusEngine.analyze(moments)
          focusScore = report.focusScore
          contextSwitchesPerHour = report.contextSwitchesPerHour
          activeSessionDurationMinutes = report.totalDurationMinutes
        }

        return {
          focusScore,
          contextSwitchesPerHour,
          activeSessionDurationMinutes,
          walStatus: 'clean',
          momentsRecorded,
        }
      }

      case 'clipboard.history': {
        if (!this.db) return []
        const limit = typeof params.limit === 'number' ? params.limit : 50
        const offset = typeof params.offset === 'number' ? params.offset : 0
        return this.db.getClipboardHistory(limit, offset)
      }

      case 'clipboard.search': {
        if (!this.db) return []
        const query = typeof params.query === 'string' ? params.query : typeof params.q === 'string' ? params.q : ''
        const limit = typeof params.limit === 'number' ? params.limit : 50
        if (!query.trim()) return this.db.getClipboardHistory(limit)
        return this.db.searchClipboard(query, limit)
      }

      case 'ai.standup': {
        if (!this.db) return { markdown: 'Timeline database not available.', appsInvolved: [], momentCount: 0, modelUsed: 'none' }
        const summaryType = params.type === 'timesheet' || params.type === 'commit_draft' ? params.type : 'daily_standup'
        const limit = typeof params.limit === 'number' ? params.limit : 100
        const moments = this.db.getMoments({ limit }).map((row) => ({
          appName: String(row.app_name ?? ''),
          windowTitle: String(row.window_title ?? ''),
          timestamp: Number(row.timestamp),
        }))
        const now = Date.now()
        const connector = new OllamaConnector()
        return connector.generateSummary({
          periodStart: now - 86400000,
          periodEnd: now,
          moments,
          summaryType,
        })
      }

      case 'retention.getSettings': {
        return {
          retentionDays: this.config.retentionDays,
          lastPurgedCount: this.lastPurgedCount,
        }
      }

      case 'retention.setSettings': {
        const days = boundedNumber(params.retentionDays, 0, 365)
        if (days === undefined) {
          throw { code: -32602, message: 'Invalid retentionDays: must be a number between 0 and 365 (0 = Unlimited)' }
        }
        this.config.retentionDays = days
        const { removed } = this.runRetention()
        return {
          success: true,
          retentionDays: this.config.retentionDays,
          purgedCount: removed,
        }
      }

      default:
        throw { code: METHOD_NOT_FOUND, message: `Method "${method}" not found` }
    }
  }

  isRunning(): boolean { return this.startedAt > 0 }
  isPaused(): boolean { return this.paused }
}
