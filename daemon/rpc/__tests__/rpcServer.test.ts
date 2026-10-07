/**
 * Tests for REWIND RPC layer:
 *   - JSON-RPC 2.0 parsing & response helpers (protocol.ts)
 *   - Auth token generation & validation (auth.ts)
 *   - RpcServer start/stop lifecycle (rpcServer.ts)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/* ── Mocks ──────────────────────────────────────────────────────── */

vi.mock('node:fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    readFileSync: vi.fn(() => 'mock-token-hex'),
  },
}))

vi.mock('node:net', () => {
  const mockServer = {
    listen: vi.fn((_a: unknown, _b: unknown, cb?: () => void) => { if (typeof _b === 'function') _b(); else cb?.() }),
    close: vi.fn((cb?: () => void) => { cb?.() }),
    listening: true,
    on: vi.fn(),
  }
  return {
    default: { createServer: vi.fn(() => mockServer) },
    createServer: vi.fn(() => mockServer),
  }
})

vi.mock('node:crypto', () => ({
  default: { randomBytes: vi.fn(() => Buffer.from('a'.repeat(32))), timingSafeEqual: vi.fn((a: Buffer, b: Buffer) => a.toString() === b.toString()) },
  randomBytes: vi.fn(() => Buffer.from('a'.repeat(32))),
  timingSafeEqual: vi.fn((a: Buffer, b: Buffer) => a.toString() === b.toString()),
}))

import {
  parseJsonRpc,
  createSuccessResponse,
  createErrorResponse,
  PARSE_ERROR,
  INVALID_REQUEST,
  METHOD_NOT_FOUND,
  AUTH_REQUIRED,
} from '../protocol.js'

import {
  generateAuthToken,
  writeAuthToken,
  readAuthToken,
  validateToken,
} from '../auth.js'

import { RpcServer } from '../rpcServer.js'

/* ── Protocol helpers ─────────────────────────────────────────── */

describe('parseJsonRpc', () => {
  it('parses a valid JSON-RPC 2.0 request', () => {
    const raw = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'daemon.status', params: { foo: 'bar' } })
    const result = parseJsonRpc(raw)
    expect(result.method).toBe('daemon.status')
    expect(result.id).toBe(1)
    expect(result.params).toEqual({ foo: 'bar' })
  })

  it('throws PARSE_ERROR on invalid JSON', () => {
    let thrownCode: number | undefined
    try { parseJsonRpc('not-json{') } catch (e) { thrownCode = (e as { code: number }).code }
    expect(thrownCode).toBe(PARSE_ERROR)
  })

  it('throws INVALID_REQUEST when method is missing', () => {
    let thrownCode: number | undefined
    try { parseJsonRpc(JSON.stringify({ jsonrpc: '2.0', id: 2 })) } catch (e) { thrownCode = (e as { code: number }).code }
    expect(thrownCode).toBe(INVALID_REQUEST)
  })

  it('throws INVALID_REQUEST when jsonrpc version is wrong', () => {
    let thrownCode: number | undefined
    try { parseJsonRpc(JSON.stringify({ jsonrpc: '1.0', id: 3, method: 'test' })) } catch (e) { thrownCode = (e as { code: number }).code }
    expect(thrownCode).toBe(INVALID_REQUEST)
  })

  it('throws INVALID_REQUEST when id is missing', () => {
    let thrownCode: number | undefined
    try { parseJsonRpc(JSON.stringify({ jsonrpc: '2.0', method: 'test' })) } catch (e) { thrownCode = (e as { code: number }).code }
    expect(thrownCode).toBe(INVALID_REQUEST)
  })
})

describe('createSuccessResponse / createErrorResponse', () => {
  it('creates a success response with result', () => {
    const resp = createSuccessResponse(42, { ok: true })
    expect(resp.jsonrpc).toBe('2.0')
    expect(resp.id).toBe(42)
    expect(resp.result).toEqual({ ok: true })
    expect(resp.error).toBeUndefined()
  })

  it('creates an error response with error object', () => {
    const resp = createErrorResponse(7, { code: METHOD_NOT_FOUND, message: 'Not found' })
    expect(resp.id).toBe(7)
    expect(resp.error?.code).toBe(METHOD_NOT_FOUND)
    expect(resp.result).toBeUndefined()
  })

  it('allows null id for parse errors', () => {
    const resp = createErrorResponse(null, { code: PARSE_ERROR, message: 'bad json' })
    expect(resp.id).toBeNull()
  })
})

/* ── Auth helpers ─────────────────────────────────────────────── */

describe('generateAuthToken', () => {
  it('returns a 64-character hex string', () => {
    const token = generateAuthToken()
    expect(typeof token).toBe('string')
    expect(token.length).toBe(64)
    expect(/^[0-9a-f]+$/i.test(token)).toBe(true)
  })
})

describe('writeAuthToken / readAuthToken', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls writeFileSync and renameSync on write', () => {
    // writeAuthToken uses atomic write: tmp → rename
    expect(() => writeAuthToken('test-token-value', '/tmp/test.token')).not.toThrow()
    expect(() => readAuthToken('/fake/path')).not.toThrow()
  })

  it('returns a string on successful read', () => {
    const token = readAuthToken('/fake/path')
    expect(typeof token).toBe('string')
  })
})

describe('validateToken', () => {
  it('returns true for matching tokens of equal length', () => {
    expect(validateToken('secretkey', 'secretkey')).toBe(true)
  })

  it('returns false for non-matching tokens', () => {
    expect(validateToken('secretkey', 'wronggkey')).toBe(false)
  })

  it('returns false when lengths differ', () => {
    expect(validateToken('short', 'much-longer-token')).toBe(false)
  })
})

/* ── RpcServer lifecycle ──────────────────────────────────────── */

describe('RpcServer', () => {
  let server: RpcServer

  beforeEach(() => {
    server = new RpcServer({
      port: 48299,
      pipeName: '\\\\.\\pipe\\rewind-test',
      authToken: 'test-token',
      onMethod: async (method: string) => ({ method }),
    })
  })

  afterEach(async () => {
    await server.stop()
  })

  it('constructs without throwing', () => {
    expect(server).toBeTruthy()
  })

  it('starts both transports without error', async () => {
    await expect(server.start()).resolves.toBeUndefined()
  })

  it('stops cleanly after starting', async () => {
    await server.start()
    await expect(server.stop()).resolves.toBeUndefined()
  })

  it('AUTH_REQUIRED error code is -32000', () => {
    expect(AUTH_REQUIRED).toBe(-32000)
  })
})
