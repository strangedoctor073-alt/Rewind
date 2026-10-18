/**
 * REWIND loopback HTTP bridge for the browser dashboard.
 *
 * Why this exists: the dashboard (a web page) used to `fetch()` the daemon's
 * RPC port over HTTP, but that port speaks newline-delimited JSON-RPC, not
 * HTTP, so the dashboard could never go "live". A browser cannot open raw
 * TCP or named pipes, so it needs a real HTTP endpoint.
 *
 * Security model (this endpoint can launch apps and read the timeline, and any
 * website you visit can try to reach 127.0.0.1):
 *  - bound to 127.0.0.1 only;
 *  - Host header must be 127.0.0.1/localhost on our port (defeats DNS rebinding);
 *  - a request carrying an Origin must come from the allow-list (default: the
 *    local Vite dev/preview ports), anything else gets 403;
 *  - everything except GET /health needs `Authorization: Bearer <auth token>`;
 *  - POST /rpc requires `Content-Type: application/json`, which forces a CORS
 *    preflight for cross-origin callers;
 *  - bodies over 64KB are rejected.
 * /health reveals nothing but `{ ok: true }`.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { validateToken } from './auth.js'
import {
  AUTH_REQUIRED,
  INTERNAL_ERROR,
  createErrorResponse,
  createSuccessResponse,
  parseJsonRpc,
  type JsonRpcError,
} from './protocol.js'
import type { MethodHandler } from './rpcServer.js'

export const DEFAULT_HTTP_PORT = 48292
const MAX_BODY_BYTES = 64 * 1024

export interface HttpBridgeConfig {
  port?: number
  authToken: string
  onMethod: MethodHandler
  allowedOrigins?: string[]
}

export const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
]

export class HttpBridge {
  private server: Server | null = null
  private readonly port: number
  private readonly authToken: string
  private readonly onMethod: MethodHandler
  private readonly allowedOrigins: Set<string>

  constructor(config: HttpBridgeConfig) {
    this.port = config.port ?? DEFAULT_HTTP_PORT
    this.authToken = config.authToken
    this.onMethod = config.onMethod
    this.allowedOrigins = new Set(config.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS)
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        void this.handle(req, res).catch(() => {
          if (!res.headersSent) this.json(res, 500, createErrorResponse(null, { code: INTERNAL_ERROR, message: 'Internal error' }))
          else res.end()
        })
      })
      this.server = server
      server.once('error', reject)
      server.listen(this.port, '127.0.0.1', () => {
        server.off('error', reject)
        server.on('error', () => { /* ignore runtime socket errors */ })
        resolve()
      })
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      const server = this.server
      this.server = null
      if (!server) return resolve()
      server.close(() => resolve())
      server.closeAllConnections()
    })
  }

  private hostAllowed(host: string | undefined): boolean {
    if (!host) return false
    const h = host.toLowerCase()
    return h === `127.0.0.1:${this.port}` || h === `localhost:${this.port}`
  }

  private json(res: ServerResponse, status: number, body: unknown, origin?: string): void {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    if (origin) {
      headers['Access-Control-Allow-Origin'] = origin
      headers['Vary'] = 'Origin'
    }
    res.writeHead(status, headers)
    res.end(JSON.stringify(body))
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!this.hostAllowed(req.headers.host)) return this.json(res, 403, { error: 'Forbidden host' })

    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : undefined
    if (origin !== undefined && !this.allowedOrigins.has(origin)) return this.json(res, 403, { error: 'Forbidden origin' })

    const url = new URL(req.url ?? '/', `http://127.0.0.1:${this.port}`)

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Max-Age': '600',
      })
      return void res.end()
    }

    if (req.method === 'GET' && url.pathname === '/health') return this.json(res, 200, { ok: true }, origin)

    if (req.method === 'POST' && url.pathname === '/rpc') {
      const auth = req.headers.authorization ?? ''
      const provided = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
      if (!provided || !validateToken(provided, this.authToken)) {
        return this.json(res, 401, createErrorResponse(null, { code: AUTH_REQUIRED, message: 'Missing or invalid bearer token' }), origin)
      }
      if (!(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
        return this.json(res, 415, { error: 'Content-Type must be application/json' }, origin)
      }

      const body = await this.readBody(req)
      if (body === null) return this.json(res, 413, { error: 'Payload exceeded 64KB limit' }, origin)

      let id: string | number | null = null
      try {
        const request = parseJsonRpc(body)
        id = request.id
        if (request.method === 'auth') return this.json(res, 200, createSuccessResponse(id, { authenticated: true }), origin)
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('RPC method execution timed out after 10000ms')), 10000) })
          const result = await Promise.race([this.onMethod(request.method, request.params ?? {}), timeout])
          return this.json(res, 200, createSuccessResponse(id, result), origin)
        } finally {
          if (timer) clearTimeout(timer)
        }
      } catch (err) {
        const e = err as Partial<JsonRpcError> | null
        const message = err instanceof Error ? err.message : typeof e?.message === 'string' ? e.message : 'Internal error'
        const code = typeof e?.code === 'number' ? e.code : INTERNAL_ERROR
        return this.json(res, 200, createErrorResponse(id, { code, message }), origin)
      }
    }

    return this.json(res, 404, { error: 'Not found' }, origin)
  }

  private readBody(req: IncomingMessage): Promise<string | null> {
    return new Promise((resolve) => {
      let size = 0
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_BODY_BYTES) {
          resolve(null)
          req.destroy()
          return
        }
        chunks.push(chunk)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      req.on('error', () => resolve(null))
    })
  }
}
