import { describe, it, expect } from 'vitest'
import {
  WindowGeometryRestorer,
  clampBoundsToDesktop,
  type DesktopRect,
  type WindowDriver,
  type WindowInfo,
} from '../geometry/windowGeometryRestorer.js'
import { WorkspaceResurrector, rowToMoment, type ResurrectorDeps } from '../workspaceResurrector.js'
import type { FsLike, LaunchRequest } from '../types.js'

const desktop: DesktopRect = { left: 0, top: 0, right: 1920, bottom: 1080 }

describe('clampBoundsToDesktop', () => {
  it('leaves on-screen bounds alone', () => {
    expect(clampBoundsToDesktop({ x: 100, y: 50, width: 800, height: 600 }, desktop)).toEqual({ x: 100, y: 50, width: 800, height: 600 })
  })
  it('pulls a window from a disconnected monitor back onto the desktop', () => {
    const out = clampBoundsToDesktop({ x: 3000, y: -900, width: 800, height: 600 }, desktop)
    expect(out).toEqual({ x: 1820, y: 0, width: 800, height: 600 })
  })
  it('shrinks oversized windows and enforces a minimum size', () => {
    expect(clampBoundsToDesktop({ x: 0, y: 0, width: 5000, height: 4000 }, desktop)).toMatchObject({ width: 1920, height: 1080 })
    expect(clampBoundsToDesktop({ x: 0, y: 0, width: 10, height: 10 }, desktop)).toMatchObject({ width: 120, height: 120 })
  })
  it('supports a virtual desktop with negative origin (monitor left of primary)', () => {
    const wide: DesktopRect = { left: -1920, top: 0, right: 1920, bottom: 1080 }
    expect(clampBoundsToDesktop({ x: -1800, y: 10, width: 800, height: 600 }, wide)).toMatchObject({ x: -1800 })
  })
  it('returns null for minimised windows', () => {
    expect(clampBoundsToDesktop({ x: -32000, y: -32000, width: 160, height: 28 }, desktop)).toBeNull()
  })
})

function fakeDriver(sequence: WindowInfo[][]): WindowDriver & { moved: Array<{ hwnd: number | bigint; x: number }> } {
  let i = 0
  const moved: Array<{ hwnd: number | bigint; x: number }> = []
  return {
    moved,
    listWindows: () => sequence[Math.min(i++, sequence.length - 1)],
    setBounds: (hwnd, b) => { moved.push({ hwnd, x: b.x }); return true },
    getDesktopRect: () => desktop,
  }
}
const win = (hwnd: number, processName: string, title = ''): WindowInfo => ({ hwnd, pid: 1, processName, title })

describe('WindowGeometryRestorer', () => {
  const opts = { sleep: async () => {}, pollMs: 1 }

  it('moves the window that appeared after launch', async () => {
    const driver = fakeDriver([[win(1, 'Code.exe')], [win(1, 'Code.exe')], [win(1, 'Code.exe'), win(2, 'Code.exe')]])
    const r = new WindowGeometryRestorer(driver, { ...opts, now: (() => { let t = 0; return () => t++ })() })
    const out = await r.restore({ processName: 'code.exe', bounds: { x: 10, y: 10, width: 800, height: 600 }, existing: new Set([1]) })
    expect(out.ok).toBe(true)
    expect(driver.moved).toEqual([{ hwnd: 2, x: 10 }])
  })

  it('falls back to a title match when the app reused an existing window', async () => {
    const driver = fakeDriver([[win(1, 'Code.exe', 'auth.ts - Rewind'), win(9, 'Code.exe', 'other')]])
    const r = new WindowGeometryRestorer(driver, opts)
    const out = await r.restore({ processName: 'Code.exe', titleHint: 'auth.ts', bounds: { x: 0, y: 0, width: 500, height: 500 }, existing: new Set([1, 9]) })
    expect(out.ok).toBe(true)
    expect(driver.moved[0].hwnd).toBe(1)
  })

  it('never moves a window it cannot tie to the launch, and times out cleanly', async () => {
    const driver = fakeDriver([[win(1, 'Code.exe', 'unrelated')]])
    let t = 0
    const r = new WindowGeometryRestorer(driver, { ...opts, timeoutMs: 5, now: () => (t += 3) })
    const out = await r.restore({ processName: 'Code.exe', titleHint: 'auth.ts', bounds: { x: 0, y: 0, width: 500, height: 500 }, existing: new Set([1]) })
    expect(out.ok).toBe(false)
    expect(out.detail).toContain('No Code.exe window appeared')
    expect(driver.moved).toHaveLength(0)
  })

  it('reports minimised windows without touching anything', async () => {
    const driver = fakeDriver([[]])
    const out = await new WindowGeometryRestorer(driver, opts).restore({ processName: 'Code.exe', bounds: { x: -32000, y: -32000, width: 100, height: 30 }, existing: new Set() })
    expect(out.ok).toBe(false)
    expect(out.detail).toContain('minimised')
  })
})

const NOW = 5_000_000
const row = (over: Record<string, unknown>) => ({
  id: 'm', timestamp: NOW, app_name: 'Code.exe', window_title: '', process_path: null, pid: null,
  bounds_x: 5, bounds_y: 6, bounds_w: 700, bounds_h: 500, is_closed: 0, ...over,
})
const dirFs: FsLike = {
  existsSync: () => true,
  statSync: (p) => ({ isDirectory: () => p === '/work' || p === '/work/Rewind', isFile: () => p.endsWith('.ts') }),
  readdirSync: (p) => {
    if (p === '/work') return [{ name: 'Rewind', isDirectory: () => true, isFile: () => false }]
    if (p === '/work/Rewind') return [{ name: 'auth.ts', isDirectory: () => false, isFile: () => true }]
    return []
  },
}

function makeResurrector(overrides: Partial<ResurrectorDeps> = {}, launched: LaunchRequest[] = []) {
  const rows: Record<string, ReturnType<typeof row>> = {
    'm-1': row({ id: 'm-1', window_title: 'auth.ts - Rewind - Visual Studio Code' }),
  }
  const deps: ResurrectorDeps = {
    getMomentById: (id) => rows[id],
    getMoments: () => [
      row({ id: 'm-2', timestamp: NOW - 1000, app_name: 'KeePassXC.exe', window_title: 'Vault' }),
      row({ id: 'm-3', timestamp: NOW - 2000, app_name: 'pwsh.exe', window_title: 'C:\\x' }),
      row({ id: 'm-4', timestamp: NOW - 3000, app_name: 'ActiveWindow', window_title: '[main] Window Moment' }),
      rows['m-1'],
    ],
    getBrowserEventsBetween: () => [],
    launcher: async (req) => { launched.push(req); return { ok: true } },
    geometry: null,
    workspaceRoots: ['/work'],
    fs: dirFs,
    ...overrides,
  }
  return new WorkspaceResurrector(deps)
}

describe('WorkspaceResurrector', () => {
  it('rowToMoment converts snake_case rows and bounds', () => {
    const m = rowToMoment(row({ id: 'x', process_path: 'C:\\a\\Code.exe' }))
    expect(m).toMatchObject({ id: 'x', appName: 'Code.exe', processPath: 'C:\\a\\Code.exe', bounds: { x: 5, y: 6, width: 700, height: 500 } })
  })

  it('validates the moment id before touching anything', async () => {
    const r = makeResurrector()
    await expect(r.resurrect({ momentId: '../../x' })).rejects.toMatchObject({ code: -32602 })
    await expect(r.resurrect({ momentId: 42 })).rejects.toMatchObject({ code: -32602 })
    await expect(r.resurrect({ momentId: 'does-not-exist' })).rejects.toMatchObject({ code: -32602 })
  })

  it('dry run plans without launching, skips password managers and unidentifiable legacy rows', async () => {
    const launched: LaunchRequest[] = []
    const report = await makeResurrector({}, launched).resurrect({ momentId: 'm-1', dryRun: true })
    expect(launched).toHaveLength(0)
    expect(report.dryRun).toBe(true)
    const labels = report.results.map((x) => x.label)
    expect(labels.some((l) => l.includes('Vault'))).toBe(false) // KeePassXC never appears
    expect(report.results.find((x) => x.kind === 'editor')?.status).toBe('planned')
    expect(report.results.find((x) => x.kind === 'terminal')?.status).toBe('skipped') // title has no real directory
    expect(report.results.some((x) => x.label.includes('Window Moment'))).toBe(false) // placeholder row ignored
  })

  it('launches the plan and reports failures per step', async () => {
    const launched: LaunchRequest[] = []
    const ok = await makeResurrector({}, launched).resurrect({ momentId: 'm-1' })
    expect(launched).toHaveLength(1)
    expect(ok.summary.launched).toBe(1)

    const failing = await makeResurrector({ launcher: async () => ({ ok: false, error: 'boom' }) }).resurrect({ momentId: 'm-1' })
    expect(failing.summary.failed).toBe(1)
    expect(failing.results[0].detail).toBe('boom')
  })

  it('repositions launched windows when a geometry restorer is available', async () => {
    const driver = fakeDriver([[], [win(7, 'Code.exe')]])
    const geometry = new WindowGeometryRestorer(driver, { sleep: async () => {}, pollMs: 1 })
    const report = await makeResurrector({ geometry }).resurrect({ momentId: 'm-1' })
    expect(report.results[0].positioned).toBe(true)
    expect(driver.moved).toEqual([{ hwnd: 7, x: 5 }])
  })

  it('refuses a second resurrection while one is running', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const r = makeResurrector({ launcher: async () => { await gate; return { ok: true } } })
    const first = r.resurrect({ momentId: 'm-1' })
    await new Promise((resolve) => setTimeout(resolve, 10))
    await expect(r.resurrect({ momentId: 'm-1' })).rejects.toMatchObject({ code: -32602 })
    release()
    await first
  })
})
