/**
 * First tests for the hand-written extension service worker.
 * A small in-memory fake of the chrome.* APIs stands in for the browser.
 */
import { describe, it, expect } from 'vitest'

type Listener = (message: Record<string, unknown>, sender: Record<string, unknown>, respond: (r: unknown) => void) => boolean | void

function makeStore(preset: Record<string, unknown> = {}) {
  const data: Record<string, unknown> = { ...preset }
  return {
    data,
    get: async (keys?: string | string[] | null) => {
      await new Promise((r) => setTimeout(r, 0)) // yield so concurrent callers really interleave
      if (keys == null) return { ...data }
      const list = Array.isArray(keys) ? keys : [keys]
      return Object.fromEntries(list.filter((k) => k in data).map((k) => [k, structuredClone(data[k])]))
    },
    set: async (obj: Record<string, unknown>) => {
      await new Promise((r) => setTimeout(r, 0))
      for (const [k, v] of Object.entries(obj)) data[k] = structuredClone(v)
    },
    remove: async (keys: string | string[]) => {
      await new Promise((r) => setTimeout(r, 0))
      for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k]
    },
  }
}

const g = globalThis as unknown as Record<string, unknown>
const local = makeStore()
const session = makeStore({
  // Left behind by a service worker that was evicted before its 600ms flush:
  'rewind:pending:900': { recordingId: 'rec-evicted', events: [{ id: 'e1', timestamp: 5 }, { id: 'e2', timestamp: 9 }] },
  'rewind:recording:rec-evicted': undefined,
})
delete session.data['rewind:recording:rec-evicted']
local.data['rewind:recording:rec-evicted'] = { id: 'rec-evicted', title: 't', duration: 0, createdAt: 'x', source: { url: 'https://a.test/' }, events: [{ id: 'start', timestamp: 0 }], active: true }
local.data['rewind:index'] = [{ id: 'rec-evicted', title: 't', url: 'https://a.test/', host: 'a.test', createdAt: 'x', duration: 0, eventCount: 1, active: true }]

let messageListener: Listener | null = null
let removedListener: ((tabId: number) => void) | null = null
let openTabs: Array<{ id: number; url: string; windowId?: number }> = []
const created: Array<{ url: string; active: boolean }> = []
const sentToTabs: Array<{ tabId: number; message: Record<string, unknown> }> = []
let failRecordingWrites = 0

const origSet = local.set
local.set = async (obj: Record<string, unknown>) => {
  if (failRecordingWrites > 0 && Object.keys(obj).some((k) => k.startsWith('rewind:recording:'))) {
    failRecordingWrites -= 1
    throw new Error('disk exploded')
  }
  return origSet(obj)
}

g.chrome = {
  storage: { local, session },
  runtime: { onMessage: { addListener: (fn: Listener) => { messageListener = fn } }, onStartup: { addListener: () => {} } },
  tabs: {
    onRemoved: { addListener: (fn: (tabId: number) => void) => { removedListener = fn } },
    query: async () => openTabs,
    update: async () => ({}),
    create: async (opts: { url: string; active: boolean }) => { created.push(opts); return { id: 500 + created.length } },
    sendMessage: async (tabId: number, message: Record<string, unknown>) => { sentToTabs.push({ tabId, message }); return { ok: true } },
  },
  windows: { update: async () => ({}) },
  scripting: { executeScript: async () => [] },
}

function send(message: Record<string, unknown>, sender: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    ;(messageListener as Listener)(message, sender, (r) => resolve(r as Record<string, unknown>))
  })
}

const tab = (id: number) => ({ id, url: `https://site${id}.test/page`, title: `Site ${id}` })
const evt = (n: number) => ({ id: `ev-${n}`, timestamp: n, kind: 'click', label: `click ${n}` })

async function startOn(id: number) {
  const t = tab(id)
  ;(g.chrome as { tabs: { query: unknown } }).tabs.query = async (q: Record<string, unknown>) => (q.active ? [t] : openTabs)
  const res = await send({ type: 'POPUP_START' })
  return (res as { recording: { id: string } }).recording
}
async function stopOn(id: number) {
  const t = tab(id)
  ;(g.chrome as { tabs: { query: unknown } }).tabs.query = async (q: Record<string, unknown>) => (q.active ? [t] : openTabs)
  return (await send({ type: 'POPUP_STOP' })) as { recording: { id: string; events: unknown[]; active: boolean; truncated?: boolean } }
}
const stored = (id: string) => local.data[`rewind:recording:${id}`] as { events: Array<{ id: string }>; active: boolean }

describe('extension service worker', () => {
  it('recovers events a service worker buffered before it was evicted', async () => {
    await import('../background.js')
    for (let i = 0; i < 40 && session.data['rewind:pending:900'] !== undefined; i++) {
      await new Promise((r) => setTimeout(r, 50))
    }
    expect(stored('rec-evicted').events.map((e) => e.id)).toEqual(['start', 'e1', 'e2'])
    expect(session.data['rewind:pending:900']).toBeUndefined()
  })

  it('loses no events when many arrive at once', async () => {
    const rec = await startOn(1)
    await Promise.all(Array.from({ length: 40 }, (_, i) => send({ type: 'REWIND_EVENT', event: evt(i + 1) }, { tab: { id: 1 } })))
    const done = await stopOn(1)
    expect(done.recording.events).toHaveLength(41) // start marker + 40
    expect(stored(rec.id).events).toHaveLength(41)
    expect(done.recording.active).toBe(false)
  })

  it('keeps events when a save fails instead of dropping them', async () => {
    const rec = await startOn(2)
    await Promise.all([1, 2, 3].map((n) => send({ type: 'REWIND_EVENT', event: evt(n) }, { tab: { id: 2 } })))
    failRecordingWrites = 1
    const done = await stopOn(2)
    expect(done.recording.events).toHaveLength(4)
    expect(stored(rec.id).events).toHaveLength(4)
  })

  it('starting twice on one tab finishes the first recording instead of orphaning it', async () => {
    const first = await startOn(3)
    const second = await startOn(3)
    expect(first.id).not.toBe(second.id)
    expect(stored(first.id).active).toBe(false)
    expect(stored(second.id).active).toBe(true)
    await stopOn(3)
  })

  it('closes out a recording when its tab is closed', async () => {
    const rec = await startOn(4)
    await send({ type: 'REWIND_EVENT', event: evt(1) }, { tab: { id: 4 } })
    ;(removedListener as (id: number) => void)(4)
    for (let i = 0; i < 40 && stored(rec.id)?.active !== false; i++) {
      await new Promise((r) => setTimeout(r, 50))
    }
    expect(stored(rec.id).active).toBe(false)
    expect(stored(rec.id).events).toHaveLength(2)
    expect(local.data['rewind:session:4']).toBeUndefined()
  })

  it('bounds history to 30 recordings', async () => {
    for (let id = 100; id < 135; id++) {
      await startOn(id)
      await stopOn(id)
    }
    const index = local.data['rewind:index'] as Array<{ id: string }>
    expect(index.length).toBeLessThanOrEqual(30)
    const recordingKeys = Object.keys(local.data).filter((k) => k.startsWith('rewind:recording:'))
    expect(recordingKeys.length).toBeLessThanOrEqual(30)
  }, 20_000)

  it('REWIND_RESTORE_TABS: refuses content-script senders, filters non-http, reuses open tabs', async () => {
    const denied = await send({ type: 'REWIND_RESTORE_TABS', tabs: [{ url: 'https://a.test/' }] }, { tab: { id: 9 } })
    expect(String(denied.error)).toContain('only accepted from extension pages')

    openTabs = [{ id: 77, url: 'https://open.test/docs?x=1', windowId: 1 }]
    created.length = 0
    sentToTabs.length = 0
    const res = (await send({
      type: 'REWIND_RESTORE_TABS',
      tabs: [
        { url: 'javascript:alert(1)' },
        { url: 'https://open.test/docs', scrollY: 420 },
        { url: 'https://new.test/page' },
      ],
    })) as { results: Array<{ ok: boolean; reused?: boolean; scrolledTo?: number | null }> }
    expect(res.results[0].ok).toBe(false)
    expect(res.results[1]).toMatchObject({ ok: true, reused: true, scrolledTo: 420 })
    expect(res.results[2]).toMatchObject({ ok: true, reused: false })
    expect(created).toEqual([{ url: 'https://new.test/page', active: true }])
    expect(sentToTabs.some((m) => m.tabId === 77 && m.message.type === 'REWIND_SCROLL_TO')).toBe(true)
  })

  it('REWIND_RESTORE_TABS caps the number of tabs it opens', async () => {
    openTabs = []
    created.length = 0
    const tabs = Array.from({ length: 30 }, (_, i) => ({ url: `https://t${i}.test/` }))
    const res = (await send({ type: 'REWIND_RESTORE_TABS', tabs })) as { skipped: number }
    expect(created).toHaveLength(12)
    expect(res.skipped).toBe(18)
  })
})
