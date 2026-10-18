/**
 * REWIND v5.0 "Deep Resurrection" shared types.
 *
 * Design rules (see AGENTS.md traps 3-5):
 *  - Everything that launches a process is expressed as a LaunchRequest: a
 *    command plus an argv array. Nothing is ever joined into a shell string.
 *  - Targets are resolved from the daemon's own database by moment id. Paths,
 *    URLs and window titles supplied by a caller are never launched directly.
 *  - Sensitive windows (Ghost Shield) are filtered before planning.
 */

export interface WindowBounds {
  x: number
  y: number
  width: number
  height: number
}

/** A moment row from the timeline database, normalised to camelCase. */
export interface MomentRecord {
  id: string
  timestamp: number
  appName: string
  windowTitle: string
  processPath?: string
  pid?: number
  bounds?: WindowBounds
  isClosed: boolean
}

/** A process launch, always argv-style. */
export interface LaunchRequest {
  command: string
  args: string[]
}

export interface LaunchOutcome {
  ok: boolean
  error?: string
}

export type Launcher = (request: LaunchRequest) => Promise<LaunchOutcome>

export type ResurrectKind = 'editor' | 'terminal' | 'browser'

/** One planned thing to bring back. */
export interface ResurrectStep {
  kind: ResurrectKind
  label: string
  momentId?: string
  /** Present when the step can be executed. */
  launch?: LaunchRequest
  /** Present instead of `launch` when the target could not be worked out. */
  unresolved?: string
  /** Where the window was when recorded (used to reposition after launch). */
  bounds?: WindowBounds
  /** Executable name of the app that will own the window (for geometry matching). */
  processName?: string
  /** Substring expected in the new window's title (for geometry matching). */
  titleHint?: string
  notes?: string[]
}

export type ResurrectStatus = 'launched' | 'planned' | 'skipped' | 'failed'

export interface ResurrectResult {
  kind: ResurrectKind
  label: string
  status: ResurrectStatus
  detail: string
  /** True when window geometry was restored after launch. */
  positioned?: boolean
}

export interface ResurrectReport {
  momentId: string
  timestamp: number
  dryRun: boolean
  results: ResurrectResult[]
  summary: Record<ResurrectStatus, number>
}

/** The slice of `node:fs` the adapters need; injectable for tests. */
export interface FsLike {
  existsSync(path: string): boolean
  statSync(path: string): { isDirectory(): boolean; isFile(): boolean }
  readdirSync(
    path: string,
    options: { withFileTypes: true },
  ): Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>
}

export interface AdapterContext {
  /** Directories under which the user keeps projects; used to find files named in window titles. */
  workspaceRoots: string[]
  fs: FsLike
}

export interface IEditorAdapter {
  readonly id: string
  canHandle(processName: string): boolean
  plan(moment: MomentRecord, ctx: AdapterContext): ResurrectStep
}
