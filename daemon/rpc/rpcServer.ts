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

export class RpcServer {
  private tcpServer: Server | null = null
  private pipeServer: Server | null = null
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

  /** Start both TCP and Named Pipe transports. */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.tcpServer = this.createTransport()
        this.pipeServer = this.createTransport()

        let resolved = 0
        const tryResolve = () => { if (++resolved === 2) resolve() }

        this.tcpServer.listen(this.port, '127.0.0.1', tryResolve)
        this.pipeServer.listen(this.pipeName, tryResolve)
      } catch (err) {
        reject(err)
      }
    })
  }

  /** Stop both transports and close all connections. */
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

      closeServer(this.tcpServer)
      closeServer(this.pipeServer)
      this.tcpServer = null
      this.pipeServer = null
    })
  }

  /** Create a net.Server that handles NDJSON JSON-RPC connections. */
  private createTransport(): Server {
    const MAX_BUFFER_BYTES = 64 * 1024 // 64KB max line buffer to prevent OOM

    const server = createServer((socket: Socket) => {
      let authenticated = false
      let buffer = ''

      socket.setEncoding('utf-8')
      socket.on('data', async (chunk: string) => {
        if (buffer.length + chunk.length > MAX_BUFFER_BYTES) {
          // Payload too large — prevent memory exhaustion attack
          this.send(socket, createErrorResponse(null, { code: -32600, message: 'Payload exceeded 64KB limit' }))
          socket.destroy()
          return
        }

        buffer += chunk
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? '' // keep partial last line

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          await this.handleMessage(socket, trimmed, authenticated, (v) => { authenticated = v })
        }
      })

      socket.on('error', () => { /* swallow client disconnects */ })
    })

    return server
  }

  /** Process a single NDJSON line from a client. */
  private async handleMessage(
    socket: Socket,
    raw: string,
    authenticated: boolean,
    setAuth: (v: boolean) => void,
  ): Promise<void> {
    try {
      const request = parseJsonRpc(raw)

      // Auth gate: first message must be auth
      if (request.method === 'auth') {
        const token = String(request.params?.token ?? '')
        if (validateToken(token, this.authToken)) {
          setAuth(true)
          this.send(socket, createSuccessResponse(request.id, { authenticated: true }))
        } else {
          this.send(socket, createErrorResponse(request.id, { code: AUTH_REQUIRED, message: 'Invalid auth token' }))
        }
        return
      }

      if (!authenticated) {
        this.send(socket, createErrorResponse(request.id, { code: AUTH_REQUIRED, message: 'Authentication required. Send auth method first.' }))
        return
      }

      // Dispatch to method handler with 10s execution timeout
      try {
        let timeoutHandle: ReturnType<typeof setTimeout> | null = null
        const timeoutPromise = new Promise((_, reject) => {
          timeoutHandle = setTimeout(() => {
            reject(new Error('RPC method execution timed out after 10000ms'))
          }, 10000)
        })

        const resultPromise = this.onMethod(request.method, request.params ?? {})
        const result = await Promise.race([resultPromise, timeoutPromise])
        if (timeoutHandle) clearTimeout(timeoutHandle)

        this.send(socket, createSuccessResponse(request.id, result))
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error'
        const code = (err as JsonRpcError)?.code ?? INTERNAL_ERROR
        this.send(socket, createErrorResponse(request.id, { code, message }))
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
