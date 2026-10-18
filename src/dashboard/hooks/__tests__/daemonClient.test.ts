import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import {
  DaemonAuthError,
  callDaemon,
  clearStoredToken,
  getStoredToken,
  pingDaemon,
  rowToDashboardMoment,
  setStoredToken,
} from '../daemonClient'

const realFetch = globalThis.fetch

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return handler(String(input), init)
  }) as typeof fetch
  return calls
}

describe('daemon client', () => {
  beforeEach(() => clearStoredToken())
  afterEach(() => {
    globalThis.fetch = realFetch
    clearStoredToken()
  })

  it('stores the token for the session only and trims it', () => {
    setStoredToken('  abc123  ')
    expect(getStoredToken()).toBe('abc123')
    clearStoredToken()
    expect(getStoredToken()).toBeNull()
  })

  it('pings the HTTP bridge, not the raw RPC port', async () => {
    const calls = stubFetch(() => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    expect(await pingDaemon()).toBe(true)
    expect(calls[0].url).toBe('http://127.0.0.1:48292/health')
  })

  it('reports the daemon as down when fetch fails', async () => {
    stubFetch(() => { throw new TypeError('Failed to fetch') })
    expect(await pingDaemon()).toBe(false)
  })

  it('refuses to call without a token', async () => {
    const calls = stubFetch(() => new Response('{}'))
    await expect(callDaemon('daemon.status')).rejects.toBeInstanceOf(DaemonAuthError)
    expect(calls).toHaveLength(0)
  })

  it('sends the bearer token and returns the JSON-RPC result', async () => {
    setStoredToken('tok')
    const calls = stubFetch(() => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { running: true } }), { status: 200 }))
    expect(await callDaemon('daemon.status')).toEqual({ running: true })
    const headers = calls[0].init?.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(String(calls[0].init?.body)).method).toBe('daemon.status')
  })

  it('forgets a rejected token and surfaces an auth error', async () => {
    setStoredToken('stale')
    stubFetch(() => new Response('{}', { status: 401 }))
    await expect(callDaemon('daemon.status')).rejects.toBeInstanceOf(DaemonAuthError)
    expect(getStoredToken()).toBeNull()
  })

  it('throws the daemon error message for JSON-RPC errors', async () => {
    setStoredToken('tok')
    stubFetch(() => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32602, message: 'Unknown moment "x"' } }), { status: 200 }))
    await expect(callDaemon('timeline.resurrectWorkspace')).rejects.toThrow('Unknown moment')
  })

  it('maps a database row to a dashboard moment', () => {
    const m = rowToDashboardMoment({
      id: 'm1', timestamp: 5, app_name: 'Code.exe', window_title: 'a.ts', process_path: 'C:\\Code.exe', pid: 7,
      bounds_x: 1, bounds_y: 2, bounds_w: 300, bounds_h: 200, phash: 'ff', is_closed: 1,
    })
    expect(m).toEqual({
      id: 'm1', timestamp: 5, appName: 'Code.exe', windowTitle: 'a.ts', processPath: 'C:\\Code.exe', pid: 7,
      bounds: { x: 1, y: 2, width: 300, height: 200 }, phash: 'ff', isClosed: true,
    })
    expect(rowToDashboardMoment({ id: 'x', timestamp: 1 }).bounds).toBeUndefined()
  })
})
