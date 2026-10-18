/** Real HTTP tests for the loopback dashboard bridge. */
import { describe, it, expect, afterEach } from 'vitest'
import http from 'node:http'
import { HttpBridge } from '../httpBridge.js'

const TOKEN = 'bridge-test-token'
let port = 48900 + Math.floor(Math.random() * 90)

/** fetch() cannot forge a Host header, so use http.request. */
function request(p: number, opts: { method?: string; path: string; headers?: Record<string, string>; body?: string }) {
  return new Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: p, method: opts.method ?? 'GET', path: opts.path, headers: opts.headers }, (res) => {
      let body = ''
      res.setEncoding('utf-8')
      res.on('data', (c) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }))
    })
    req.on('error', reject)
    if (opts.body) req.write(opts.body)
    req.end()
  })
}

describe('HttpBridge', () => {
  const bridges: HttpBridge[] = []
  afterEach(async () => { for (const b of bridges.splice(0)) await b.stop() })

  async function boot(onMethod = async (m: string) => ({ echoed: m })) {
    const p = port++
    const b = new HttpBridge({ port: p, authToken: TOKEN, onMethod })
    bridges.push(b)
    await b.start()
    return p
  }
  const rpcBody = (method: string) => JSON.stringify({ jsonrpc: '2.0', id: 1, method })
  const authed = { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` }

  it('serves an unauthenticated /health that reveals nothing else', async () => {
    const p = await boot()
    const res = await request(p, { path: '/health' })
    expect(res.status).toBe(200)
    expect(JSON.parse(res.body)).toEqual({ ok: true })
  })

  it('requires the bearer token for /rpc', async () => {
    const p = await boot()
    expect((await request(p, { method: 'POST', path: '/rpc', headers: { 'content-type': 'application/json' }, body: rpcBody('x') })).status).toBe(401)
    expect((await request(p, { method: 'POST', path: '/rpc', headers: { ...authed, authorization: 'Bearer nope' }, body: rpcBody('x') })).status).toBe(401)
    const ok = await request(p, { method: 'POST', path: '/rpc', headers: authed, body: rpcBody('daemon.status') })
    expect(JSON.parse(ok.body).result).toEqual({ echoed: 'daemon.status' })
  })

  it('rejects foreign origins and DNS-rebinding Host headers', async () => {
    const p = await boot()
    expect((await request(p, { path: '/health', headers: { origin: 'https://evil.example' } })).status).toBe(403)
    expect((await request(p, { path: '/health', headers: { host: 'evil.example' } })).status).toBe(403)
  })

  it('answers the CORS preflight only for allowed origins', async () => {
    const p = await boot()
    const ok = await request(p, { method: 'OPTIONS', path: '/rpc', headers: { origin: 'http://localhost:5173' } })
    expect(ok.status).toBe(204)
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    const extOk = await request(p, { method: 'OPTIONS', path: '/rpc', headers: { origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' } })
    expect(extOk.status).toBe(204)
    expect(extOk.headers['access-control-allow-origin']).toBe('chrome-extension://abcdefghijklmnopabcdefghijklmnop')
    expect((await request(p, { method: 'OPTIONS', path: '/rpc', headers: { origin: 'https://evil.example' } })).status).toBe(403)
  })

  it('insists on a JSON content type and caps the body size', async () => {
    const p = await boot()
    expect((await request(p, { method: 'POST', path: '/rpc', headers: { ...authed, 'content-type': 'text/plain' }, body: rpcBody('x') })).status).toBe(415)
    const big = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'x', params: { pad: 'a'.repeat(70 * 1024) } })
    expect((await request(p, { method: 'POST', path: '/rpc', headers: authed, body: big }).catch(() => ({ status: 413 }))).status).toBe(413)
  })

  it('surfaces handler errors as JSON-RPC errors with the handler message', async () => {
    const p = await boot(async () => { throw { code: -32602, message: 'bad params' } })
    const res = await request(p, { method: 'POST', path: '/rpc', headers: authed, body: rpcBody('x') })
    expect(JSON.parse(res.body).error).toEqual({ code: -32602, message: 'bad params' })
  })

  it('stop() completes while a keep-alive connection is open', async () => {
    const p = await boot()
    const agent = new http.Agent({ keepAlive: true })
    await new Promise<void>((resolve) => http.get({ host: '127.0.0.1', port: p, path: '/health', agent }, (r) => { r.resume(); r.on('end', resolve) }))
    const done = await Promise.race([bridges[0].stop().then(() => 'stopped'), new Promise((r) => setTimeout(() => r('HUNG'), 3000))])
    expect(done).toBe('stopped')
    agent.destroy()
  })
})
