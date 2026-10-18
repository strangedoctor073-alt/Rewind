/**
 * Workspace resurrection orchestrator: backs the `timeline.resurrectWorkspace`
 * RPC method.
 *
 * Zero-trust: the caller supplies only a moment id. The moment, its
 * neighbours and the browser events are all read from the daemon's own
 * database; no path, URL, command or window title from the caller is used.
 */

import fs from 'node:fs'
import path from 'node:path'
import type { DbBrowserEvent } from '../db/timelineDb.js'
import { isWindowAllowed } from '../privacy.js'
import { BrowserReplayAdapter } from './browser/browserReplayAdapter.js'
import { VsCodeAdapter } from './editors/vscodeAdapter.js'
import type { WindowGeometryRestorer } from './geometry/windowGeometryRestorer.js'
import { TerminalAdapter } from './terminal/terminalAdapter.js'
import type {
  AdapterContext,
  FsLike,
  IEditorAdapter,
  Launcher,
  MomentRecord,
  ResurrectReport,
  ResurrectResult,
  ResurrectStatus,
  ResurrectStep,
  WindowBounds,
} from './types.js'

export const INVALID_PARAMS = -32602
const MOMENT_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/
const DEFAULT_WINDOW_MS = 10 * 60_000
const MAX_WINDOW_MS = 60 * 60_000

export interface ResurrectorDeps {
  getMomentById(id: string): Record<string, unknown> | undefined
  getMoments(options: { since?: number; until?: number; limit?: number }): Record<string, unknown>[]
  getBrowserEventsBetween(since: number, until: number): DbBrowserEvent[]
  launcher: Launcher
  /** null when geometry restore is unavailable (non-Windows, Koffi missing). */
  geometry: WindowGeometryRestorer | null
  workspaceRoots: string[]
  fs?: FsLike
}

export interface ResurrectOptions {
  momentId: unknown
  dryRun?: unknown
  windowMs?: unknown
  maxSteps?: unknown
}

function rpcError(message: string): { code: number; message: string } {
  return { code: INVALID_PARAMS, message }
}

/** DB row (snake_case) -> MomentRecord. */
export function rowToMoment(row: Record<string, unknown>): MomentRecord {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  const w = num(row.bounds_w)
  const h = num(row.bounds_h)
  const x = num(row.bounds_x)
  const y = num(row.bounds_y)
  const bounds: WindowBounds | undefined = w && h && x !== undefined && y !== undefined ? { x, y, width: w, height: h } : undefined
  return {
    id: String(row.id),
    timestamp: Number(row.timestamp),
    appName: String(row.app_name ?? ''),
    windowTitle: String(row.window_title ?? ''),
    processPath: typeof row.process_path === 'string' ? row.process_path : undefined,
    pid: num(row.pid),
    bounds,
    isClosed: Number(row.is_closed ?? 0) === 1,
  }
}

function processNameOf(m: MomentRecord): string {
  return (m.processPath ? path.win32.basename(m.processPath) : '') || m.appName
}

export class WorkspaceResurrector {
  private readonly editors: IEditorAdapter[] = [new VsCodeAdapter()]
  private readonly terminal = new TerminalAdapter()
  private readonly browser: BrowserReplayAdapter
  private readonly ctx: AdapterContext
  private busy = false
  private readonly deps: ResurrectorDeps

  constructor(deps: ResurrectorDeps) {
    this.deps = deps
    this.ctx = { workspaceRoots: deps.workspaceRoots, fs: deps.fs ?? (fs as unknown as FsLike) }
    this.browser = new BrowserReplayAdapter((since, until) => deps.getBrowserEventsBetween(since, until))
  }

  /** Work out what would be brought back, without launching anything. */
  plan(options: ResurrectOptions): { moment: MomentRecord; steps: ResurrectStep[] } {
    if (typeof options.momentId !== 'string' || !MOMENT_ID_PATTERN.test(options.momentId)) {
      throw rpcError('momentId must be a string of letters, digits and _ . : -')
    }
    const row = this.deps.getMomentById(options.momentId)
    if (!row) throw rpcError(`Unknown moment "${options.momentId}"`)
    const anchor = rowToMoment(row)

    const windowMs =
      typeof options.windowMs === 'number' && Number.isFinite(options.windowMs)
        ? Math.min(MAX_WINDOW_MS, Math.max(60_000, options.windowMs))
        : DEFAULT_WINDOW_MS
    const maxSteps =
      typeof options.maxSteps === 'number' && Number.isFinite(options.maxSteps)
        ? Math.min(25, Math.max(1, Math.trunc(options.maxSteps)))
        : 10

    // Newest-first rows around the anchor; keep the latest moment per distinct window.
    const neighbours = this.deps
      .getMoments({ since: anchor.timestamp - windowMs, until: anchor.timestamp, limit: 200 })
      .map(rowToMoment)
    const seen = new Set<string>()
    const unique: MomentRecord[] = []
    for (const m of [anchor, ...neighbours]) {
      const key = `${processNameOf(m).toLowerCase()}|${m.windowTitle}`
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(m)
    }

    const steps: ResurrectStep[] = []
    for (const m of unique) {
      const proc = processNameOf(m)
      // Ghost Shield applies on the way out as well as on the way in.
      if (!isWindowAllowed(proc, m.windowTitle)) continue
      const editor = this.editors.find((e) => e.canHandle(proc))
      if (editor) {
        steps.push(editor.plan(m, this.ctx))
      } else if (this.terminal.canHandle(proc)) {
        steps.push(this.terminal.plan(m, this.ctx))
      }
    }
    steps.push(...this.browser.plan(anchor.timestamp))

    return { moment: anchor, steps: steps.slice(0, maxSteps) }
  }

  async resurrect(options: ResurrectOptions): Promise<ResurrectReport> {
    const dryRun = options.dryRun === true
    const { moment, steps } = this.plan(options)

    if (this.busy) throw rpcError('A workspace resurrection is already in progress.')
    this.busy = true
    try {
      const results: ResurrectResult[] = []
      for (const step of steps) results.push(await this.runStep(step, dryRun))
      return {
        momentId: moment.id,
        timestamp: moment.timestamp,
        dryRun,
        results,
        summary: summarise(results),
      }
    } finally {
      this.busy = false
    }
  }

  private async runStep(step: ResurrectStep, dryRun: boolean): Promise<ResurrectResult> {
    const base = { kind: step.kind, label: step.label }
    const notes = step.notes?.length ? ` ${step.notes.join(' ')}` : ''

    if (!step.launch) {
      return { ...base, status: 'skipped', detail: `${step.unresolved ?? 'Nothing to launch.'}${notes}`.trim() }
    }
    if (dryRun) {
      return { ...base, status: 'planned', detail: `Would run ${step.launch.command} ${step.launch.args.join(' ')}.${notes}`.trim() }
    }

    const geometry = this.deps.geometry
    const canPosition = Boolean(geometry && step.bounds && step.processName && step.kind !== 'browser')
    const existing = canPosition && geometry ? geometry.snapshot(step.processName as string) : new Set<number | bigint>()

    const outcome = await this.deps.launcher(step.launch)
    if (!outcome.ok) return { ...base, status: 'failed', detail: outcome.error ?? 'Launch failed.' }

    if (canPosition && geometry) {
      const placed = await geometry.restore({
        processName: step.processName as string,
        titleHint: step.titleHint,
        bounds: step.bounds as WindowBounds,
        existing,
      })
      return { ...base, status: 'launched', positioned: placed.ok, detail: `Launched. ${placed.detail}${notes}`.trim() }
    }
    return { ...base, status: 'launched', positioned: false, detail: `Launched.${notes}`.trim() }
  }
}

function summarise(results: ResurrectResult[]): Record<ResurrectStatus, number> {
  const summary: Record<ResurrectStatus, number> = { launched: 0, planned: 0, skipped: 0, failed: 0 }
  for (const r of results) summary[r.status] += 1
  return summary
}
