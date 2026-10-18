/**
 * Browser-side client for the daemon's loopback HTTP bridge.
 *
 * The dashboard used to fetch `http://127.0.0.1:48291/status`, but that port
 * speaks newline-delimited JSON-RPC over raw TCP, not HTTP, so the request
 * could never succeed. The daemon now exposes an authenticated HTTP bridge on
 * 48292 (see daemon/rpc/httpBridge.ts):
 *   GET  /health  - unauthenticated liveness check
 *   POST /rpc     - JSON-RPC 2.0, requires `Authorization: Bearer <token>`
 * The token comes from `rewind token`; it is kept in sessionStorage only, so
 * it is forgotten when the tab closes.
 */

import type { DashboardMoment } from '../types'

export const DAEMON_HTTP = 'http://127.0.0.1:48292'
const TOKEN_KEY = 'rewind.daemonToken'

export function getStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setStoredToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token.trim())
  } catch {
    // storage unavailable: the token simply will not persist
  }
}

export function clearStoredToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

export class DaemonAuthError extends Error {}

/** Is the daemon's HTTP bridge up? Needs no token and reveals nothing else. */
export async function pingDaemon(timeoutMs = 1200): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(`${DAEMON_HTTP}/health`, { signal: controller.signal })
    return resp.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

/** Call a daemon JSON-RPC method. Throws DaemonAuthError when the token is missing or rejected. */
export async function callDaemon<T>(method: string, params: Record<string, unknown> = {}, timeoutMs = 4000): Promise<T> {
  const token = getStoredToken()
  if (!token) throw new DaemonAuthError('No daemon token. Run `rewind token` and paste it into the dashboard.')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(`${DAEMON_HTTP}/rpc`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
      signal: controller.signal,
    })
    if (resp.status === 401) {
      clearStoredToken()
      throw new DaemonAuthError('The daemon rejected the token. Run `rewind token` again.')
    }
    const body = (await resp.json()) as { result?: T; error?: { message?: string } }
    if (body.error) throw new Error(body.error.message ?? 'Daemon error')
    return body.result as T
  } finally {
    clearTimeout(timer)
  }
}

/** A database row (snake_case) from `timeline.getRecent` as a dashboard moment. */
export function rowToDashboardMoment(row: Record<string, unknown>): DashboardMoment {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  const w = num(row.bounds_w)
  const h = num(row.bounds_h)
  return {
    id: String(row.id),
    timestamp: Number(row.timestamp),
    appName: String(row.app_name ?? 'Unknown'),
    windowTitle: String(row.window_title ?? ''),
    processPath: typeof row.process_path === 'string' ? row.process_path : undefined,
    pid: num(row.pid),
    bounds: w && h ? { x: num(row.bounds_x) ?? 0, y: num(row.bounds_y) ?? 0, width: w, height: h } : undefined,
    phash: typeof row.phash === 'string' ? row.phash : undefined,
    isClosed: Number(row.is_closed ?? 0) === 1,
  }
}

export interface ResurrectResultView {
  kind: 'editor' | 'terminal' | 'browser'
  label: string
  status: 'launched' | 'planned' | 'skipped' | 'failed'
  detail: string
  positioned?: boolean
}

export interface ResurrectReportView {
  momentId: string
  dryRun: boolean
  results: ResurrectResultView[]
  summary: Record<ResurrectResultView['status'], number>
}

export function resurrectWorkspace(momentId: string, dryRun: boolean): Promise<ResurrectReportView> {
  return callDaemon<ResurrectReportView>('timeline.resurrectWorkspace', { momentId, dryRun }, 30_000)
}
