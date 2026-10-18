/**
 * REWIND Dual-Transport RPC Server
 * Exposes daemon methods over:
 *   1. TCP socket on 127.0.0.1:48291 (dashboard / extension)
 *   2. Named Pipe \\.\pipe\rewind-daemon-rpc (local CLI)
 *
 * Protocol: Newline-Delimited JSON (NDJSON) carrying JSON-RPC 2.0 messages.
 * First message on every connection must be an `auth` call.
 */

import { createServer, type Server, type Socket } from 'node:net'
import { validateToken } from './auth.js'
import {
  parseJsonRpc,
  createSuccessResponse,
  createErrorResponse,
  AUTH_REQUIRED,
  INTERNAL_ERROR,
  type JsonRpcError,
} from './protocol.js'

export type MethodHandler = (method: string, params: Record<string, unknown>) => Promise<unknown>

export interface RpcServerConfig {
  port?: number
  pipeName?: string
  authToken: string
  onMethod: MethodHandler
}

/** Per-connection state; one instance lives for the lifetime of a socket. */
interface ConnectionState {
  authenticated: boolean
  authFailures: number
}

/** A client that fails `auth` this many times is disconnected. */
const MAX_AUTH_FAILURES = 5
/** An unauthenticated connection that stays silent this long is dropped. */
const AUTH_DEADLINE_MS = 10_000
/** Longest single NDJSON line we will buffer (prevents OOM from a never-ending line). */
const MAX_LINE_BYTES = 64 * 1024

export class RpcServer {
  private tcpServer: Server | null = null
  private pipeServer: Server | null = null
  private readonly sockets = new Set<Socket>()
  private readonly port: number
  private readonly pipeName: string
  private readonly authToken: string
  private readonly onMethod: MethodHandler

  constructor(config: RpcServerConfig) {
    this.port = config.port ?? 48291
    this.pipeName = config.pipeName ?? '\\\\.\\pipe\\rewind-daemon-rpc'
    this.authToken = config.authToken
    this.onMethod = config.onMethod
  }

  /**
   * Start both TCP and Named Pipe transports.
   * Rejects (and tears down whatever did start) if either transport fails to
   * listen, e.g. EADDRINUSE because another daemon already owns the port.
   * Previously a listen error was an unhandled 'error' event: the process
   * crashed and this promise never settled.
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false
      const fail = (err: unknown) => {
        if (settled) return // runtime errors after a successful start are ignored here
        settled = true
        void this.stop().finally(() => reject(err))
      }

      try {
        this.tcpServer = this.createTransport(fail)
        this.pipeServer = this.createTransport(fail)

        let listening = 0
        const tryResolve = () => {
          if (++listening === 2 && !settled) {
            settled = true
            resolve()
          }
        }

        this.tcpServer.listen(this.port, '127.0.0.1', tryResolve)
        this.pipeServer.listen(this.pipeName, tryResolve)
      } catch (err) {
        fail(err)
      }
    })
  }

  /**
   * Stop both transports and close all connections.
   * `Server.close()` waits for every open connection to end, so a connected
   * client (for instance the CLI that just sent `daemon.stop`) used to make
   * this hang forever and the database was never closed. Open sockets are now
   * destroyed explicitly.
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      let closed = 0
      const tryResolve = () => { if (++closed >= 2) resolve() }

      const closeServer = (server: Server | null) => {
        if (server) {
          server.close(() => tryResolve())
        } else {
          tryResolve()
        }
      }

      const tcp = this.tcpServer
      const pipe = this.pipeServer
      this.tcpServer = null
      this.pipeServer = null

      closeServer(tcp)
      closeServer(pipe)

      for (const socket of this.sockets) socket.destroy()
      this.sockets.clear()
    })
  }

  /** Create a net.Server that handles NDJSON JSON-RPC connections. */
  private createTransport(onServerError: (err: unknown) => void): Server {
    const server = createServer((socket: Socket) => {
      this.sockets.add(socket)
      socket.on('close', () => { this.sockets.delete(socket) })

      const state: ConnectionState = { authenticated: false, authFailures: 0 }
      let buffer = ''
      // Messages on one connection are processed strictly in order. The old
      // async 'data' handler let two chunks run concurrently, so responses
      // could be reordered and a request could be judged against stale auth state.
      let queue: Promise<void> = Promise.resolve()

      socket.setEncoding('utf-8')
      socket.setTimeout(AUTH_DEADLINE_MS)
      socket.on('timeout', () => {
        if (!state.authenticated) socket.destroy()
        else socket.setTimeout(0)
      })

      socket.on('data', (chunk: string) => {
        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // keep partial last line

        const oversized = buffer.length > MAX_LINE_BYTES || lines.some((l) => l.length > MAX_LINE_BYTES)
        if (oversized) {
          this.send(socket, createErrorResponse(null, { code: -32600, message: 'Payload exceeded 64KB limit' }))
          socket.destroy()
          return
        }

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          queue = queue.then(() => this.handleMessage(socket, trimmed, state))
        }
      })

      socket.on('error', () => { /* swallow client disconnects */ })
    })

    server.on('error', onServerError)
    return server
  }

  /** Process a single NDJSON line from a client. */
  private async handleMessage(socket: Socket, raw: string, state: ConnectionState): Promise<void> {
    if (socket.destroyed) return
    try {
      const request = parseJsonRpc(raw)

      // Auth gate: first message must be auth
      if (request.method === 'auth') {
        const token = String(request.params?.token ?? '')
        if (validateToken(token, this.authToken)) {
          state.authenticated = true
          socket.setTimeout(0)
          this.send(socket, createSuccessResponse(request.id, { authenticated: true }))
        } else {
          state.authFailures += 1
          this.send(socket, createErrorResponse(request.id, { code: AUTH_REQUIRED, message: 'Invalid auth token' }))
          if (state.authFailures >= MAX_AUTH_FAILURES) socket.destroy()
        }
        return
      }

      if (!state.authenticated) {
        this.send(socket, createErrorResponse(request.id, { code: AUTH_REQUIRED, message: 'Authentication required. Send auth method first.' }))
        return
      }

      // Dispatch to method handler with 10s execution timeout
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error('RPC method execution timed out after 10000ms'))
          }, 10000)
        })

        const resultPromise = this.onMethod(request.method, request.params ?? {})
        const result = await Promise.race([resultPromise, timeoutPromise])

        this.send(socket, createSuccessResponse(request.id, result))
      } catch (err) {
        // Handlers signal protocol errors by throwing a plain { code, message }
        // object, not an Error; keep its message instead of "Internal error".
        const asRpc = err as Partial<JsonRpcError> | null
        const message =
          err instanceof Error ? err.message
          : typeof asRpc?.message === 'string' ? asRpc.message
          : 'Internal error'
        const code = typeof asRpc?.code === 'number' ? asRpc.code : INTERNAL_ERROR
        this.send(socket, createErrorResponse(request.id, { code, message }))
      } finally {
        // Also cleared on the error path; it used to leak a live 10s timer.
        if (timeoutHandle) clearTimeout(timeoutHandle)
      }
    } catch (err) {
      // parseJsonRpc threw a JsonRpcError
      const rpcErr = err as JsonRpcError
      this.send(socket, createErrorResponse(null, { code: rpcErr.code ?? INTERNAL_ERROR, message: rpcErr.message ?? 'Parse error' }))
    }
  }

  /** Send a JSON-RPC response as an NDJSON line with backpressure handling. */
  private send(socket: Socket, response: unknown): void {
    if (!socket.destroyed) {
      const line = JSON.stringify(response) + '\n'
      const canWriteMore = socket.write(line)
      if (!canWriteMore && typeof socket.pause === 'function') {
        socket.pause()
        socket.once('drain', () => {
          if (!socket.destroyed && typeof socket.resume === 'function') {
            socket.resume()
          }
        })
      }
    }
  }

  /** Expose for testing: whether TCP server is listening. */
  get listening(): boolean {
    return (this.tcpServer?.listening ?? false) || (this.pipeServer?.listening ?? false)
  }
}
