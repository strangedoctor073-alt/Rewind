/**
 * Tests for REWIND Daemon Orchestrator (daemon/index.ts)
 *
 * All constructor mocks MUST use `class` syntax inside vi.mock() factories.
 * Using vi.fn().mockImplementation(() => ({...})) does NOT work as a constructor.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/* ── Mocks ──────────────────────────────────────────────────────── */

vi.mock('node:fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    readFileSync: vi.fn(() => 'mock-auth-token'),
  },
}))

// TimelineDatabase: class mock so `new TimelineDatabase(...)` works
vi.mock('../db/timelineDb.js', () => {
  const TimelineDatabase = vi.fn(function (this: Record<string, unknown>) {
    this.getMoments = vi.fn(() => [])
    this.searchFts = vi.fn(() => [])
    this.countMoments = vi.fn(() => 321)
    this.checkpoint = vi.fn()
    this.purgeOlderThan = vi.fn(() => ({ removed: 0, screenshotPaths: [] }))
    this.getMomentById = vi.fn(() => undefined)
    this.getBrowserEventsBetween = vi.fn(() => [])
    this.insertMoment = vi.fn()
    this.close = vi.fn()
  }) as unknown as new (...args: unknown[]) => { getMoments: () => []; searchFts: () => []; close: () => void }
  return { TimelineDatabase }
})

// RpcServer: class mock
vi.mock('../rpc/rpcServer.js', () => {
  const RpcServer = vi.fn(function (this: Record<string, unknown>) {
    this.start = vi.fn().mockResolvedValue(undefined)
    this.stop = vi.fn().mockResolvedValue(undefined)
    this.listening = true
  }) as unknown as new (...args: unknown[]) => { start: () => Promise<void>; stop: () => Promise<void> }
  return { RpcServer }
})

// HttpBridge: class mock so the suite never binds a real port
vi.mock('../rpc/httpBridge.js', () => {
  const HttpBridge = vi.fn(function (this: Record<string, unknown>) {
    this.start = vi.fn().mockResolvedValue(undefined)
    this.stop = vi.fn().mockResolvedValue(undefined)
  }) as unknown as new (...args: unknown[]) => { start: () => Promise<void>; stop: () => Promise<void> }
  return { HttpBridge }
})

vi.mock('../rpc/auth.js', () => ({
  generateAuthToken: vi.fn(() => 'mock-auth-token-hex-256bit'),
  writeAuthToken: vi.fn(),
  readAuthToken: vi.fn(() => 'mock-auth-token-hex-256bit'),
  validateToken: vi.fn(() => true),
}))

// GitWatcher: class mock
vi.mock('../git/gitWatcher.js', () => {
  const GitWatcher = vi.fn(function (this: Record<string, unknown>) {
    this.getContext = vi.fn(() => ({
      branch: 'main',
      commitHash: 'abc1234',
      dirtyFileCount: 0,
      repoRoot: '/fake/repo',
    }))
    this.watchForChanges = vi.fn()
    this.stopWatching = vi.fn()
  }) as unknown as new (...args: unknown[]) => {
    getContext: () => { branch: string; commitHash: string; dirtyFileCount: number; repoRoot: string }
    stopWatching: () => void
  }
  return { GitWatcher }
})

vi.mock('../rpc/protocol.js', () => ({
  METHOD_NOT_FOUND: -32601,
}))

// WindowCaptureEngine: class mock
vi.mock('../capture/windowCapture.js', () => {
  const WindowCaptureEngine = vi.fn(function (this: Record<string, unknown>) {
    this.captureActiveWindow = vi.fn().mockResolvedValue({
      id: 'mock-cap-1',
      timestamp: Date.now(),
      hwnd: 12345,
      width: 800,
      height: 600,
      phash: '0000111122223333',
      screenshotPath: '/fake/screenshots/mock-cap-1.bmp',
      isChanged: true,
    })
    this.getLastPhash = vi.fn(() => '0000111122223333')
  }) as unknown as new (...args: unknown[]) => {
    captureActiveWindow: () => Promise<unknown>
    getLastPhash: () => string
  }
  return { WindowCaptureEngine }
})

import { RewindDaemon } from '../index.js'

/* ── Tests ──────────────────────────────────────────────────────── */

describe('RewindDaemon construction', () => {
  it('constructs with default config', () => {
    const daemon = new RewindDaemon()
    expect(daemon).toBeTruthy()
    expect(daemon.isRunning()).toBe(false)
    expect(daemon.isPaused()).toBe(false)
  })

  it('constructs with custom config', () => {
    const daemon = new RewindDaemon({ dbPath: ':memory:', rpcPort: 49999 })
    expect(daemon).toBeTruthy()
  })
})

describe('RewindDaemon start / stop', () => {
  let daemon: RewindDaemon

  beforeEach(() => {
    daemon = new RewindDaemon({ dbPath: ':memory:', rpcPort: 48299 })
    vi.clearAllTimers()
  })

  afterEach(async () => {
    if (daemon.isRunning()) await daemon.stop()
    vi.clearAllTimers()
  })

  it('start() marks daemon as running', async () => {
    await daemon.start()
    expect(daemon.isRunning()).toBe(true)
  })

  it('stop() marks daemon as not running', async () => {
    await daemon.start()
    await daemon.stop()
    expect(daemon.isRunning()).toBe(false)
  })

  it('initializes DB, RpcServer, and GitWatcher on start', async () => {
    const { TimelineDatabase } = await import('../db/timelineDb.js')
    const { RpcServer } = await import('../rpc/rpcServer.js')
    const { GitWatcher } = await import('../git/gitWatcher.js')
    vi.clearAllMocks()

    await daemon.start()

    expect(TimelineDatabase).toHaveBeenCalled()
    expect(RpcServer).toHaveBeenCalled()
    expect(GitWatcher).toHaveBeenCalled()
  })
})

describe('RewindDaemon RPC method dispatch', () => {
  let daemon: RewindDaemon

  beforeEach(async () => {
    daemon = new RewindDaemon({ dbPath: ':memory:', rpcPort: 48299 })
    await daemon.start()
  })

  afterEach(async () => {
    if (daemon.isRunning()) await daemon.stop()
    vi.clearAllTimers()
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function dispatch(method: string, params: Record<string, unknown> = {}): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (daemon as unknown as any).handleRpcMethod(method, params)
  }

  it('daemon.status returns correct shape', async () => {
    const status = await dispatch('daemon.status')
    expect(status).toMatchObject({ running: true, paused: false })
    expect(typeof status.uptime).toBe('number')
    expect(typeof status.dbPath).toBe('string')
  })

  it('daemon.pause toggles pause state', async () => {
    expect(daemon.isPaused()).toBe(false)
    const r1 = await dispatch('daemon.pause')
    expect(r1.paused).toBe(true)
    expect(daemon.isPaused()).toBe(true)
    const r2 = await dispatch('daemon.pause')
    expect(r2.paused).toBe(false)
    expect(daemon.isPaused()).toBe(false)
  })

  it('daemon.status reports the real moment count, not a page of rows', async () => {
    const status = await dispatch('daemon.status')
    expect(status.momentCount).toBe(321)
  })

  it('daemon.pause accepts an explicit state and ignores nonsense minutes', async () => {
    const r1 = await dispatch('daemon.pause', { paused: true, minutes: 'abc' })
    expect(r1).toEqual({ paused: true, resumesIn: null })
    const r2 = await dispatch('daemon.pause', { paused: true, minutes: -5 })
    expect(r2.resumesIn).toBe('1 minutes') // clamped to the 1 minute minimum
    const r3 = await dispatch('daemon.pause', { paused: false })
    expect(r3).toEqual({ paused: false, resumesIn: null })
  })

  it('timeline.resurrectWorkspace rejects a malformed moment id', async () => {
    await expect(dispatch('timeline.resurrectWorkspace', { momentId: '../../etc/passwd' })).rejects.toMatchObject({ code: -32602 })
  })

  it('timeline.search dispatches to db.searchFts', async () => {
    const results = await dispatch('timeline.search', { query: 'hello', limit: 10 })
    expect(Array.isArray(results)).toBe(true)
  })

  it('timeline.getRecent dispatches to db.getMoments', async () => {
    const results = await dispatch('timeline.getRecent', { limit: 5 })
    expect(Array.isArray(results)).toBe(true)
  })

  it('git.context returns branch info', async () => {
    const ctx = await dispatch('git.context')
    expect(ctx.branch).toBe('main')
    expect(ctx.commitHash).toBe('abc1234')
  })

  it('timeline.captureNow returns captured frame result', async () => {
    const res = await dispatch('timeline.captureNow')
    expect(res.captured).toBe(true)
    expect(res.frame).toMatchObject({ id: 'mock-cap-1', hwnd: 12345 })
  })

  it('unknown method throws METHOD_NOT_FOUND error', async () => {
    await expect(dispatch('bogus.method')).rejects.toMatchObject({ code: -32601 })
  })
})
