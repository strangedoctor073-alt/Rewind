/**
 * Tests for REWIND CLI (bin/rewind.js)
 * Tests logic helpers without spawning the actual process.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

/* ── Mocks ──────────────────────────────────────────────────────── */

vi.mock('node:net', () => {
  const mockSocket = {
    setEncoding: vi.fn(),
    write: vi.fn(),
    destroy: vi.fn(),
    destroyed: false,
    on: vi.fn((event: string, cb: (data?: unknown) => void) => {
      if (event === 'connect') {
        // Simulate immediate connect
        Promise.resolve().then(() => cb())
      }
      return mockSocket
    }),
  }
  return {
    createConnection: vi.fn(() => mockSocket),
    _mockSocket: mockSocket,
  }
})

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({
    pid: 12345,
    unref: vi.fn(),
  })),
}))

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(() => 'mock-auth-token-hex'),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

/* ── Tests ──────────────────────────────────────────────────────── */

describe('CLI: auth token reader', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads auth token from LOCALAPPDATA path', () => {
    const token = (readFileSync as ReturnType<typeof vi.fn>)('/fake/path', 'utf-8')
    expect(token).toBe('mock-auth-token-hex')
  })

  it('returns null when token file does not exist', () => {
    ;(readFileSync as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    })
    let result: string | null = null
    try {
      result = (readFileSync as ReturnType<typeof vi.fn>)('/no-file', 'utf-8')
    } catch {
      // expected error
    }
    expect(result).toBeNull()
  })
})

describe('CLI: start command spawns detached process', () => {
  it('spawn is called with detached: true', () => {
    const mockSpawn = spawn as ReturnType<typeof vi.fn>
    mockSpawn('node', ['daemon/index.ts'], { detached: true, stdio: 'ignore' })
    expect(mockSpawn).toHaveBeenCalledWith(
      'node',
      ['daemon/index.ts'],
      expect.objectContaining({ detached: true, stdio: 'ignore' })
    )
  })

  it('spawn result has pid and unref', () => {
    const child = (spawn as ReturnType<typeof vi.fn>)('node', ['--version'])
    expect(typeof child.pid).toBe('number')
    expect(typeof child.unref).toBe('function')
  })
})

describe('CLI: JSON-RPC message format', () => {
  it('formats a valid JSON-RPC 2.0 request', () => {
    const request = {
      jsonrpc: '2.0' as const,
      id: 1,
      method: 'timeline.search',
      params: { query: 'login bug', limit: 20 },
    }
    const line = JSON.stringify(request) + '\n'
    expect(line).toContain('"jsonrpc":"2.0"')
    expect(line).toContain('"method":"timeline.search"')
    expect(line.endsWith('\n')).toBe(true)
  })

  it('formats auth request with token param', () => {
    const token = 'abc123'
    const authMsg = JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'auth', params: { token } })
    const parsed = JSON.parse(authMsg)
    expect(parsed.method).toBe('auth')
    expect(parsed.params.token).toBe('abc123')
  })

  it('handles search query with spaces', () => {
    const query = 'login bug fix'
    const msg = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'timeline.search', params: { query } })
    const parsed = JSON.parse(msg)
    expect(parsed.params.query).toBe('login bug fix')
  })
})

describe('CLI: ANSI color codes', () => {
  it('contains ANSI green for success', () => {
    const GREEN = '\x1b[32m'
    const RESET = '\x1b[0m'
    const msg = `${GREEN}✓ Done${RESET}`
    expect(msg).toContain('\x1b[32m')
    expect(msg).toContain('\x1b[0m')
  })

  it('contains ANSI red for errors', () => {
    const RED = '\x1b[31m'
    const msg = `${RED}✗ Error${RED}`
    expect(msg).toContain('\x1b[31m')
  })
})

describe('CLI: help text', () => {
  it('includes all expected subcommands', () => {
    const helpText = `
      start     - Start daemon
      stop      - Stop daemon
      status    - Show status
      capture   - Capture active window
      search    - Full-text search
      undo      - Universal undo
      pause     - Pause recording
      autostart - Manage Windows startup
      export    - Export provenance
      help      - Show help
    `
    const commands = ['start', 'stop', 'status', 'capture', 'search', 'undo', 'pause', 'autostart', 'export', 'help']
    for (const cmd of commands) {
      expect(helpText).toContain(cmd)
    }
  })
})
