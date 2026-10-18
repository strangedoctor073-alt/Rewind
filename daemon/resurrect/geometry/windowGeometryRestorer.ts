/**
 * Phase 5.4: multi-monitor window geometry restoration.
 *
 * Logic lives here and is driver-agnostic so it can be unit-tested on Linux;
 * the Win32 calls (EnumWindows / SetWindowPos) are in `win32Driver.ts`.
 *
 * Multi-monitor: a window recorded on a monitor that is no longer connected
 * would be placed off-screen. `clampBoundsToDesktop` pulls it back onto the
 * current virtual desktop (the union of all monitors).
 *
 * DPI: coordinates are only comparable if the recording process and the
 * restoring process use the same DPI awareness. The Win32 driver switches the
 * daemon to per-monitor-v2 awareness so both sides deal in physical pixels.
 */

import type { WindowBounds } from '../types.js'

export interface DesktopRect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface WindowInfo {
  hwnd: number | bigint
  pid: number
  processName: string
  title: string
}

export interface WindowDriver {
  listWindows(): WindowInfo[]
  setBounds(hwnd: number | bigint, bounds: WindowBounds): boolean
  getDesktopRect(): DesktopRect
}

export interface GeometryTarget {
  processName: string
  titleHint?: string
  bounds: WindowBounds
  /** Windows that already existed before the launch, so we can spot the new one. */
  existing: Set<number | bigint>
}

export interface GeometryOutcome {
  ok: boolean
  detail: string
}

const MIN_SIZE = 120
/** Windows reports minimised windows at about (-32000, -32000). */
const MINIMISED_THRESHOLD = -30000
/** Keep at least this much of the window inside the desktop so it can be grabbed. */
const MIN_VISIBLE = 100

/** Fit `bounds` inside the virtual desktop. Returns null for bounds that mean "was minimised". */
export function clampBoundsToDesktop(bounds: WindowBounds, desktop: DesktopRect): WindowBounds | null {
  if (bounds.x <= MINIMISED_THRESHOLD || bounds.y <= MINIMISED_THRESHOLD) return null
  const deskW = desktop.right - desktop.left
  const deskH = desktop.bottom - desktop.top
  if (deskW <= 0 || deskH <= 0) return null

  const width = Math.min(Math.max(Math.round(bounds.width), MIN_SIZE), deskW)
  const height = Math.min(Math.max(Math.round(bounds.height), MIN_SIZE), deskH)
  const x = Math.min(Math.max(Math.round(bounds.x), desktop.left), desktop.right - Math.min(width, MIN_VISIBLE))
  const y = Math.min(Math.max(Math.round(bounds.y), desktop.top), desktop.bottom - Math.min(height, MIN_VISIBLE))
  return { x, y, width, height }
}

export interface RestorerOptions {
  timeoutMs?: number
  pollMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

export class WindowGeometryRestorer {
  private readonly timeoutMs: number
  private readonly pollMs: number
  private readonly sleep: (ms: number) => Promise<void>
  private readonly now: () => number
  private readonly driver: WindowDriver

  constructor(driver: WindowDriver, options: RestorerOptions = {}) {
    this.driver = driver
    this.timeoutMs = options.timeoutMs ?? 8000
    this.pollMs = options.pollMs ?? 250
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
    this.now = options.now ?? Date.now
  }

  /** Handles of every window currently owned by `processName`; call before launching. */
  snapshot(processName: string): Set<number | bigint> {
    const wanted = processName.toLowerCase()
    return new Set(this.driver.listWindows().filter((w) => w.processName.toLowerCase() === wanted).map((w) => w.hwnd))
  }

  async restore(target: GeometryTarget): Promise<GeometryOutcome> {
    const desktop = this.driver.getDesktopRect()
    const bounds = clampBoundsToDesktop(target.bounds, desktop)
    if (!bounds) return { ok: false, detail: 'The window was minimised (or the desktop size is unknown), so there is no position to restore.' }

    const wanted = target.processName.toLowerCase()
    const hint = target.titleHint?.toLowerCase()
    const deadline = this.now() + this.timeoutMs

    for (;;) {
      const windows = this.driver.listWindows().filter((w) => w.processName.toLowerCase() === wanted)

      // Prefer a window that did not exist before the launch...
      let match = windows.find((w) => !target.existing.has(w.hwnd))
      // ...otherwise the app reused a window: accept one whose title matches.
      if (!match && hint) match = windows.find((w) => w.title.toLowerCase().includes(hint))

      if (match) {
        return this.driver.setBounds(match.hwnd, bounds)
          ? { ok: true, detail: `Moved to ${bounds.width}×${bounds.height} at (${bounds.x}, ${bounds.y}).` }
          : { ok: false, detail: 'Windows refused to move the window (it may be running elevated).' }
      }

      if (this.now() >= deadline) return { ok: false, detail: `No ${target.processName} window appeared within ${Math.round(this.timeoutMs / 1000)}s.` }
      await this.sleep(this.pollMs)
    }
  }
}
