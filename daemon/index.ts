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
import { TimelineDatabase } from './db/timelineDb.js'
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
  private runRetention(): void {
    if (!this.db || this.config.retentionDays <= 0) return
    try {
      const { screenshotPaths } = this.db.purgeOlderThan(Date.now() - this.config.retentionDays * 24 * HOUR_MS)
      for (const file of screenshotPaths) {
        try { fs.rmSync(file, { force: true }) } catch { /* already gone */ }
      }
    } catch {
      // retention must never take the daemon down
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

      case 'timeline.undo':
        // Placeholder — will be implemented with Win32 Ctrl+Z integration
        return { undone: false, reason: 'Not yet implemented' }

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

      case 'provenance.export':
        // Placeholder — will delegate to ProvenanceExporter when connected
        return { schemaVersion: '1.0.0', note: 'Provenance export placeholder' }

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
        throw { code: -32602, message: `Unsupported export format "${format}"` }
      }

      default:
        throw { code: METHOD_NOT_FOUND, message: `Method "${method}" not found` }
    }
  }

  isRunning(): boolean { return this.startedAt > 0 }
  isPaused(): boolean { return this.paused }
}
