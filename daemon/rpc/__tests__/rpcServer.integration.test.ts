/**
 * Real-socket tests for RpcServer (no mocks). These exist because the mocked
 * suite in rpcServer.test.ts replaces `node:net`, so it could never notice that
 * stop() hung on open connections or that a port clash crashed the process.
 */

import { describe, it, expect, afterEach } from 'vitest'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { RpcServer } from '../rpcServer.js'

let portCounter = 48500 + Math.floor(Math.random() * 400)
const nextPort = () => portCounter++
const pipeFor = (port: number) =>
  process.platform === 'win32' ? `\\\\.\\pipe\\rewind-it-${port}` : path.join(os.tmpdir(), `rewind-it-${port}.sock`)

const TOKEN = 'integration-test-token'

/** Tiny NDJSON client. */
function connect(port: number) {
  const socket = net.connect(port, '127.0.0.1')
  let buffer = ''
  const lines: string[] = []
  const waiters: Array<() => void> = []
  socket.setEncoding('utf-8')
  socket.on('data', (chunk: string) => {
    buffer += chunk
    const parts = buffer.split('\n')
    buffer = parts.pop() ?? ''
    for (const p of parts) if (p) lines.push(p)
    waiters.splice(0).forEach((w) => w())
  })
  socket.on('error', () => {})
  const next = async (): Promise<Record<string, unknown>> => {
    while (lines.length === 0) {
      await new Promise<void>((resolve) => {
        waiters.push(resolve)
        setTimeout(resolve, 2000)
      })
      if (lines.length === 0 && socket.destroyed) throw new Error('socket closed')
      if (lines.length === 0) throw new Error('timed out waiting for response')
    }
    return JSON.parse(lines.shift() as string)
  }
  const send = (obj: unknown) => socket.write(JSON.stringify(obj) + '\n')
  const ready = new Promise<void>((resolve) => socket.once('connect', () => resolve()))
  return { socket, next, send, ready }
}

describe('RpcServer (real sockets)', () => {
  const servers: RpcServer[] = []
  const clients: net.Socket[] = []

  afterEach(async () => {
    for (const c of clients.splice(0)) c.destroy()
    for (const s of servers.splice(0)) await s.stop()
  })

  async function boot(onMethod: (method: string, params: Record<string, unknown>) => Promise<unknown> = async (method, params) => ({ method, params })) {
    const port = nextPort()
    const server = new RpcServer({ port, pipeName: pipeFor(port), authToken: TOKEN, onMethod })
    servers.push(server)
    await server.start()
    return { server, port }
  }

  it('rejects calls before auth and accepts them after', async () => {
    const { port } = await boot()
    const c = connect(port)
    clients.push(c.socket)
    await c.ready

    c.send({ jsonrpc: '2.0', id: 1, method: 'daemon.status' })
    const denied = await c.next()
    expect((denied.error as { code: number }).code).toBe(-32000)

    c.send({ jsonrpc: '2.0', id: 2, method: 'auth', params: { token: TOKEN } })
    expect((await c.next()).result).toEqual({ authenticated: true })

    c.send({ jsonrpc: '2.0', id: 3, method: 'daemon.status', params: { a: 1 } })
    expect((await c.next()).result).toEqual({ method: 'daemon.status', params: { a: 1 } })
  })

  it('stop() resolves even while a client is still connected', async () => {
    const { server, port } = await boot()
    const c = connect(port)
    clients.push(c.socket)
    await c.ready
    c.send({ jsonrpc: '2.0', id: 1, method: 'auth', params: { token: TOKEN } })
    await c.next()

    const result = await Promise.race([
      server.stop().then(() => 'stopped'),
      new Promise((resolve) => setTimeout(() => resolve('HUNG'), 3000)),
    ])
    expect(result).toBe('stopped')
  })

  it('start() rejects instead of crashing when the port is already taken', async () => {
    const { port } = await boot()
    const clash = new RpcServer({ port, pipeName: pipeFor(port + 1000), authToken: TOKEN, onMethod: async () => null })
    servers.push(clash)
    await expect(clash.start()).rejects.toThrow()
  })

  it('keeps the message of a plain { code, message } error thrown by a handler', async () => {
    const { port } = await boot(async () => {
      throw { code: -32601, message: 'Method "x" not found' }
    })
    const c = connect(port)
    clients.push(c.socket)
    await c.ready
    c.send({ jsonrpc: '2.0', id: 1, method: 'auth', params: { token: TOKEN } })
    await c.next()
    c.send({ jsonrpc: '2.0', id: 2, method: 'x' })
    const res = await c.next()
    expect(res.error).toEqual({ code: -32601, message: 'Method "x" not found' })
  })

  it('answers pipelined requests in order even when an earlier one is slower', async () => {
    const { port } = await boot(async (method) => {
      if (method === 'slow') await new Promise((r) => setTimeout(r, 120))
      return { method }
    })
    const c = connect(port)
    clients.push(c.socket)
    await c.ready
    c.send({ jsonrpc: '2.0', id: 1, method: 'auth', params: { token: TOKEN } })
    await c.next()

    // One write containing two lines -> two requests handled back to back.
    c.socket.write(
      JSON.stringify({ jsonrpc: '2.0', id: 10, method: 'slow' }) + '\n' +
      JSON.stringify({ jsonrpc: '2.0', id: 11, method: 'fast' }) + '\n',
    )
    expect((await c.next()).id).toBe(10)
    expect((await c.next()).id).toBe(11)
  })

  it('disconnects a client after repeated bad tokens', async () => {
    const { port } = await boot()
    const c = connect(port)
    clients.push(c.socket)
    await c.ready
    for (let i = 0; i < 5; i++) c.send({ jsonrpc: '2.0', id: i + 1, method: 'auth', params: { token: 'wrong' } })
    for (let i = 0; i < 5; i++) await c.next()
    await new Promise((r) => setTimeout(r, 100))
    expect(c.socket.destroyed).toBe(true)
  })
})
