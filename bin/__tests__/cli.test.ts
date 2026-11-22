/**
 * @vitest-environment node
 * Tests that import the real CLI module (the older rewind.test.ts only exercises mocks).
 */
import { describe, it, expect, vi } from 'vitest'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const rpcState = vi.hoisted(() => ({
  requests: [] as Array<{ method: string; id?: number; params?: Record<string, unknown> }>,
  onData: undefined as ((chunk: string) => void) | undefined,
}))

vi.mock('node:net', () => ({
  createConnection: vi.fn(() => {
    const socket = {
      setEncoding: vi.fn(),
      destroy: vi.fn(),
      write: vi.fn((raw: string) => {
        const request = JSON.parse(raw) as { method: string; id?: number; params?: Record<string, unknown> }
        rpcState.requests.push(request)
        const result = request.method === 'auth' ? { authenticated: true } : { undone: true, targetApp: 'TestEditor' }
        queueMicrotask(() => rpcState.onData?.(`${JSON.stringify({ jsonrpc: '2.0', id: request.id, result })}\n`))
      }),
      on: vi.fn((event: string, callback: (chunk?: string) => void) => {
        if (event === 'connect') queueMicrotask(() => callback())
        if (event === 'data') rpcState.onData = (chunk) => callback(chunk)
        return socket
      }),
    }
    return socket
  }),
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return { ...actual, readFileSync: vi.fn(() => 'test-only-auth-token') }
})

// @ts-expect-error bin/rewind.js is plain JavaScript with no type declarations
import { parseResurrectArgs, daemonEntryPath, cmdMacro, cmdVault } from '../rewind.js'

describe('CLI helpers', () => {
  it('importing the module does not run the CLI', () => {
    expect(typeof parseResurrectArgs).toBe('function')
    expect(typeof cmdMacro).toBe('function')
    expect(typeof cmdVault).toBe('function')
  })

  it('parses resurrect arguments in either order', () => {
    expect(parseResurrectArgs(['m-123', '--dry-run'])).toEqual({ momentId: 'm-123', dryRun: true })
    expect(parseResurrectArgs(['--dry-run', 'm-123'])).toEqual({ momentId: 'm-123', dryRun: true })
    expect(parseResurrectArgs(['m-123'])).toEqual({ momentId: 'm-123', dryRun: false })
    expect(parseResurrectArgs([])).toEqual({ momentId: undefined, dryRun: false })
  })

  it('rewind undo forwards the explicit moment ID to the daemon', async () => {
    const originalArgv = process.argv
    const cliPath = fileURLToPath(new URL('../rewind.js', import.meta.url))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    rpcState.requests.length = 0
    rpcState.onData = undefined

    try {
      process.argv = [process.execPath, cliPath, 'undo', 'm-123']
      vi.resetModules()
      // @ts-expect-error bin/rewind.js is plain JavaScript with no type declarations
      await import('../rewind.js')
      await vi.waitFor(() => expect(rpcState.requests.some((request) => request.method === 'timeline.undo')).toBe(true))
      const undoRequest = rpcState.requests.find((request) => request.method === 'timeline.undo')
      expect(undoRequest?.params).toEqual({ momentId: 'm-123' })
    } finally {
      process.argv = originalArgv
      log.mockRestore()
    }
  })

  it('rewind undo rejects a missing moment ID before contacting the daemon', async () => {
    const originalArgv = process.argv
    const originalExitCode = process.exitCode
    const cliPath = fileURLToPath(new URL('../rewind.js', import.meta.url))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    rpcState.requests.length = 0
    rpcState.onData = undefined

    try {
      process.argv = [process.execPath, cliPath, 'undo']
      vi.resetModules()
      // @ts-expect-error bin/rewind.js is plain JavaScript with no type declarations
      await import('../rewind.js')
      await vi.waitFor(() => {
        const sentUndo = rpcState.requests.some((request) => request.method === 'timeline.undo')
        const rejected = error.mock.calls.some(([message]) => String(message).includes('Usage: rewind undo <momentId>'))
        expect(sentUndo || rejected).toBe(true)
      })
      expect(error).toHaveBeenCalledWith(expect.stringContaining('Usage: rewind undo <momentId>'))
      expect(rpcState.requests.some((request) => request.method === 'timeline.undo')).toBe(false)
    } finally {
      process.argv = originalArgv
      process.exitCode = originalExitCode
      error.mockRestore()
      log.mockRestore()
    }
  })

  it('points start at the compiled daemon, not a .ts file that needs tsx', () => {
    const entry = daemonEntryPath()
    expect(entry.endsWith(path.join('dist-daemon', 'daemon', 'main.js'))).toBe(true)
  })
})
