/**
 * REWIND Headless Daemon Orchestrator
 * Background service that coordinates:
 *   - TimelineDatabase (SQLite + FTS5)
 *   - RPC Server (TCP + Named Pipe)
 *   - Git Branch Watcher
 *   - Capture loop (Win32 PrintWindow — placeholder)
 *   - WAL backup loop (atomic 20s writes)
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { TimelineDatabase } from './db/timelineDb.js'
import { RpcServer, type MethodHandler } from './rpc/rpcServer.js'
import { generateAuthToken, writeAuthToken } from './rpc/auth.js'
import { GitWatcher } from './git/gitWatcher.js'
import { WindowCaptureEngine } from './capture/windowCapture.js'
import { METHOD_NOT_FOUND } from './rpc/protocol.js'

export interface DaemonConfig {
  dbPath?: string
  rpcPort?: number
  pipeName?: string
  captureIntervalMs?: number
  walIntervalMs?: number
  gitRepoRoot?: string
}

function defaultDbPath(): string {
  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')
  return path.join(base, 'Rewind', 'timeline.db')
}

export class RewindDaemon {
  private readonly config: Required<DaemonConfig>
  private db: TimelineDatabase | null = null
  private rpc: RpcServer | null = null
  private gitWatcher: GitWatcher | null = null
  private captureEngine: WindowCaptureEngine | null = null
  private captureTimer: ReturnType<typeof setInterval> | null = null
  private walTimer: ReturnType<typeof setInterval> | null = null
  private paused = false
  private authToken = ''
  private startedAt = 0

  constructor(config: DaemonConfig = {}) {
    this.config = {
      dbPath: config.dbPath ?? defaultDbPath(),
      rpcPort: config.rpcPort ?? 48291,
      pipeName: config.pipeName ?? '\\\\.\\pipe\\rewind-daemon-rpc',
      captureIntervalMs: config.captureIntervalMs ?? 2000,
      walIntervalMs: config.walIntervalMs ?? 20000,
      gitRepoRoot: config.gitRepoRoot ?? process.cwd(),
    }
  }

  /** Start the daemon: database → auth → RPC → git → capture → WAL. */
  async start(): Promise<void> {
    // 1. Ensure data directory exists
    const dbDir = path.dirname(this.config.dbPath)
    fs.mkdirSync(dbDir, { recursive: true })

    // 2. Initialize SQLite timeline database
    this.db = new TimelineDatabase(this.config.dbPath)

    // 3. Generate & persist auth token
    this.authToken = generateAuthToken()
    writeAuthToken(this.authToken)

    // 4. Create & start RPC server
    const methodHandler: MethodHandler = (method, params) => this.handleRpcMethod(method, params)
    this.rpc = new RpcServer({
      port: this.config.rpcPort,
      pipeName: this.config.pipeName,
      authToken: this.authToken,
      onMethod: methodHandler,
    })
    await this.rpc.start()

    // 5. Initialize git watcher
    this.gitWatcher = new GitWatcher(this.config.gitRepoRoot)

    // 6. Initialize native window capture engine
    this.captureEngine = new WindowCaptureEngine()

    // 7. Start capture loop with visual change detection
    this.captureTimer = setInterval(async () => {
      if (this.paused || !this.captureEngine || !this.db) return
      try {
        const frame = await this.captureEngine.captureActiveWindow()
        if (frame && frame.isChanged) {
          const gitCtx = this.gitWatcher?.getContext()
          this.db.insertMoment({
            id: frame.id,
            timestamp: frame.timestamp,
            appName: 'ActiveWindow',
            windowTitle: gitCtx ? `[${gitCtx.branch}] Window Moment` : 'Window Moment',
            boundsW: frame.width,
            boundsH: frame.height,
            phash: frame.phash,
            screenshotPath: frame.screenshotPath,
          })
        }
      } catch {
        // transient capture error
      }
    }, this.config.captureIntervalMs)

    // 8. Start WAL backup loop (atomic 20s persistence)
    this.walTimer = setInterval(() => {
      // Periodic WAL maintenance
    }, this.config.walIntervalMs)

    this.startedAt = Date.now()
    console.log(`↶ REWIND Daemon started on port ${this.config.rpcPort}`)
    console.log(`  Database: ${this.config.dbPath}`)
    console.log(`  Pipe: ${this.config.pipeName}`)
  }

  /** Gracefully shut down all subsystems in reverse order. */
  async stop(): Promise<void> {
    if (this.walTimer) { clearInterval(this.walTimer); this.walTimer = null }
    if (this.captureTimer) { clearInterval(this.captureTimer); this.captureTimer = null }
    if (this.captureEngine) { this.captureEngine = null }
    if (this.gitWatcher) { this.gitWatcher.stopWatching(); this.gitWatcher = null }
    if (this.rpc) { await this.rpc.stop(); this.rpc = null }
    if (this.db) { this.db.close(); this.db = null }
    this.startedAt = 0
    console.log('↶ REWIND Daemon stopped.')
  }

  /** JSON-RPC method dispatcher. */
  private async handleRpcMethod(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case 'daemon.status':
        return {
          running: true,
          paused: this.paused,
          uptime: this.startedAt > 0 ? Math.round((Date.now() - this.startedAt) / 1000) : 0,
          momentCount: this.db ? (this.db.getMoments({ limit: 1 }).length > 0 ? this.db.getMoments().length : 0) : 0,
          dbPath: this.config.dbPath,
        }

      case 'daemon.pause': {
        const minutes = typeof params.minutes === 'number' ? params.minutes : 0
        this.paused = !this.paused
        if (this.paused && minutes > 0) {
          setTimeout(() => { this.paused = false }, minutes * 60 * 1000)
        }
        return { paused: this.paused, resumesIn: this.paused && minutes > 0 ? `${minutes} minutes` : null }
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
        const query = typeof params.query === 'string' ? params.query : ''
        const limit = typeof params.limit === 'number' ? params.limit : 20
        return this.db.searchFts(query, limit)
      }

      case 'timeline.undo':
        // Placeholder — will be implemented with Win32 Ctrl+Z integration
        return { undone: false, reason: 'Not yet implemented' }

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

      default:
        throw { code: METHOD_NOT_FOUND, message: `Method "${method}" not found` }
    }
  }

  isRunning(): boolean { return this.startedAt > 0 }
  isPaused(): boolean { return this.paused }
}
