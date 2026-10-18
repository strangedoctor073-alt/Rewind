// Storage layout in chrome.storage.local:
//   rewind:index                -> RecordingSummary[]  (cheap list for the Timeline page)
//   rewind:recording:<id>       -> full Recording blob (events included)
//   rewind:session:<tabId>      -> id of the recording currently active for that tab
//
// This replaces the old single-slot "rewind:lastRecording" model so the
// Timeline page can show real history, not just the most recent session.

const now = () => new Date().toISOString()
const recordingKey = (id) => `rewind:recording:${id}`
const sessionPointerKey = (tabId) => `rewind:session:${tabId}`

const makeStartEvent = () => ({
  id: crypto.randomUUID(), timestamp: 0, kind: 'click', icon: 'START',
  label: 'Recording started', description: 'Capture began in an authorized browser tab',
  category: 'Recording', target: 'browser-tab'
})

function safeHost(url) {
  try { return url ? new URL(url).hostname : '' } catch { return '' }
}

function summarize(recording) {
  return {
    id: recording.id,
    title: recording.title,
    url: recording.source?.url || '',
    host: safeHost(recording.source?.url),
    createdAt: recording.createdAt,
    duration: recording.duration,
    eventCount: recording.events.length,
    active: Boolean(recording.active)
  }
}

// ── Concurrency model ────────────────────────────────────────────────────────
// The content script fires one message per interaction and the service worker
// handles them concurrently. The previous read-modify-write code could lose
// events in two ways: two overlapping flushes both read the stored recording
// and the later write clobbered the earlier one, and two simultaneous events
// could each create their own buffer so one overwrote the other. All work for a
// tab is therefore serialised through a per-tab queue, and the shared index
// through a single lock.

const tabQueues = new Map()

function enqueue(tabId, task) {
  const previous = tabQueues.get(tabId) || Promise.resolve()
  const next = previous.catch(() => {}).then(task)
  tabQueues.set(tabId, next)
  next.catch(() => {}).finally(() => { if (tabQueues.get(tabId) === next) tabQueues.delete(tabId) })
  return next
}

let indexLock = Promise.resolve()
function withIndexLock(task) {
  const run = indexLock.catch(() => {}).then(task)
  indexLock = run
  return run
}

// ── Limits ───────────────────────────────────────────────────────────────────
// chrome.storage.local is capped (about 10MB without the unlimitedStorage
// permission, which this project deliberately does not request), so growth must
// be bounded or writes start failing and events are silently lost.
const MAX_RECORDINGS = 30
const MAX_EVENTS_PER_RECORDING = 3000
const FLUSH_AFTER_EVENTS = 15
const FLUSH_AFTER_MS = 600
const PENDING_PREFIX = 'rewind:pending:'
const pendingKey = (tabId) => `${PENDING_PREFIX}${tabId}`

async function readIndex() {
  const result = await chrome.storage.local.get('rewind:index')
  return result['rewind:index'] || []
}

async function writeIndex(index) {
  await chrome.storage.local.set({ 'rewind:index': index })
}

function upsertIndex(recording) {
  return withIndexLock(async () => {
    const index = await readIndex()
    await writeIndex([summarize(recording), ...index.filter((item) => item.id !== recording.id)])
  })
}

function removeFromIndex(id) {
  return withIndexLock(async () => {
    const index = await readIndex()
    await writeIndex(index.filter((item) => item.id !== id))
  })
}

async function getRecording(id) {
  if (!id) return undefined
  const result = await chrome.storage.local.get(recordingKey(id))
  return result[recordingKey(id)]
}

async function saveRecording(recording) {
  await chrome.storage.local.set({ [recordingKey(recording.id)]: recording })
  await upsertIndex(recording)
}

/** Delete the oldest finished recordings so at most `keep` remain. Active ones are never pruned. */
async function pruneRecordings(keep = MAX_RECORDINGS) {
  const doomed = await withIndexLock(async () => {
    const index = await readIndex()
    const finished = index.filter((item) => !item.active)
    const excess = Math.max(0, index.length - keep)
    // The index is newest-first, so the oldest finished recordings are at the end.
    const victims = finished.slice(-excess).slice(0, excess)
    if (victims.length === 0) return []
    const victimIds = new Set(victims.map((item) => item.id))
    await writeIndex(index.filter((item) => !victimIds.has(item.id)))
    return victims.map((item) => item.id)
  })
  if (doomed.length) await chrome.storage.local.remove(doomed.map(recordingKey))
}

function isQuotaError(error) {
  return /quota/i.test(error instanceof Error ? error.message : String(error))
}

async function getActiveSessionId(tabId) {
  const result = await chrome.storage.local.get(sessionPointerKey(tabId))
  return result[sessionPointerKey(tabId)]
}

async function getActiveSession(tabId) {
  await enqueue(tabId, () => flushNow(tabId))
  return getRecording(await getActiveSessionId(tabId))
}

// ── Event buffering ──────────────────────────────────────────────────────────
// Events are batched for 600ms to avoid a storage write per click. A buffer
// that only lived in memory was lost whenever the MV3 service worker was
// evicted, so every buffered event is also mirrored to chrome.storage.session
// (in-memory, survives worker restarts) and drained when the worker wakes.

const pendingSessionBuffers = new Map()

async function mirrorPending(tabId, bufferInfo) {
  try {
    if (bufferInfo.events.length === 0) await chrome.storage.session?.remove(pendingKey(tabId))
    else await chrome.storage.session?.set({ [pendingKey(tabId)]: { recordingId: bufferInfo.recordingId, events: bufferInfo.events } })
  } catch { /* session storage unavailable: fall back to memory only */ }
}

/** Append events to a stored recording, honouring the per-recording event cap. */
async function appendEvents(recordingId, events) {
  const recording = await getRecording(recordingId)
  if (!recording) return
  const room = Math.max(0, MAX_EVENTS_PER_RECORDING - recording.events.length)
  const accepted = events.slice(0, room)
  if (accepted.length < events.length) recording.truncated = true
  recording.events.push(...accepted)
  recording.duration = Math.max(recording.duration, accepted.at(-1)?.timestamp || 0)
  try {
    await saveRecording(recording)
  } catch (error) {
    if (!isQuotaError(error)) throw error
    // Storage is full: free the oldest finished recordings and retry once.
    await pruneRecordings(Math.max(1, Math.floor(MAX_RECORDINGS / 2)))
    await saveRecording(recording)
  }
}

/** Write the buffered events for a tab to storage. Must run inside the tab's queue. */
async function flushNow(tabId) {
  const bufferInfo = pendingSessionBuffers.get(tabId)
  if (!bufferInfo || bufferInfo.events.length === 0) return
  if (bufferInfo.timer) { clearTimeout(bufferInfo.timer); bufferInfo.timer = null }

  const events = bufferInfo.events.splice(0)
  try {
    await appendEvents(bufferInfo.recordingId, events)
  } catch (error) {
    // Put the events back instead of dropping them; the next flush retries.
    bufferInfo.events.unshift(...events)
    await mirrorPending(tabId, bufferInfo)
    console.warn('REWIND: could not save events, will retry', error)
    return
  }
  if (bufferInfo.events.length === 0) pendingSessionBuffers.delete(tabId)
  await mirrorPending(tabId, bufferInfo)
}

function scheduleFlush(tabId, bufferInfo) {
  if (bufferInfo.timer) clearTimeout(bufferInfo.timer)
  bufferInfo.timer = setTimeout(() => {
    bufferInfo.timer = null
    void enqueue(tabId, () => flushNow(tabId))
  }, FLUSH_AFTER_MS)
}

function queueSessionEvent(tabId, event) {
  return enqueue(tabId, async () => {
    const recordingId = await getActiveSessionId(tabId)
    if (!recordingId) return

    let bufferInfo = pendingSessionBuffers.get(tabId)
    if (!bufferInfo || bufferInfo.recordingId !== recordingId) {
      bufferInfo = { recordingId, events: bufferInfo?.events ?? [], timer: null }
      pendingSessionBuffers.set(tabId, bufferInfo)
    }
    bufferInfo.events.push(event)
    await mirrorPending(tabId, bufferInfo)

    if (bufferInfo.events.length >= FLUSH_AFTER_EVENTS) await flushNow(tabId)
    else scheduleFlush(tabId, bufferInfo)
  })
}

/** After a worker restart, move events that were still buffered into their recordings. */
async function drainPending() {
  try {
    const stored = (await chrome.storage.session?.get(null)) || {}
    for (const [key, value] of Object.entries(stored)) {
      if (!key.startsWith(PENDING_PREFIX) || !value || !Array.isArray(value.events)) continue
      const tabId = Number(key.slice(PENDING_PREFIX.length))
      await enqueue(tabId, async () => {
        await appendEvents(value.recordingId, value.events)
        await chrome.storage.session.remove(key)
      })
    }
  } catch { /* nothing to drain, or session storage unavailable */ }
}

// ── Recording lifecycle ──────────────────────────────────────────────────────

async function startRecording(tab) {
  if (!tab?.id || !tab.url?.startsWith('http')) throw new Error('Open a normal http(s) website first. Browser settings and store pages cannot be recorded.')
  // Starting twice used to orphan the first recording as "active" forever.
  if (await getActiveSessionId(tab.id)) await stopRecording(tab.id).catch(() => {})
  const recording = {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    title: `${tab.title || 'Untitled page'} recording`,
    duration: 0,
    createdAt: now(),
    source: { url: tab.url, title: tab.title || '', mode: 'extension' },
    events: [makeStartEvent()],
    active: true
  }
  await chrome.storage.local.set({ [sessionPointerKey(tab.id)]: recording.id })
  await saveRecording(recording)
  await pruneRecordings().catch(() => {})
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
  await chrome.tabs.sendMessage(tab.id, { type: 'REWIND_START', sessionId: recording.id })
  return recording
}

async function stopRecording(tabId) {
  const recording = await getActiveSession(tabId) // flushes buffered events first
  if (!recording) throw new Error('No REWIND session exists for this tab.')
  try { await chrome.tabs.sendMessage(tabId, { type: 'REWIND_STOP' }) } catch { /* Tab may have navigated. Stored events remain usable. */ }
  return enqueue(tabId, async () => {
    await flushNow(tabId) // the content script flushes its last input on REWIND_STOP
    const latest = (await getRecording(recording.id)) || recording
    latest.active = false
    latest.duration = Math.max(latest.duration, latest.events.at(-1)?.timestamp || 0)
    await saveRecording(latest)
    await chrome.storage.local.remove(sessionPointerKey(tabId))
    return latest
  })
}

// A closed tab can never send REWIND_STOP, which left its recording marked
// active and its pointer stored for good.
chrome.tabs.onRemoved?.addListener((tabId) => {
  void stopRecording(tabId).catch(() => {})
})

// Tab ids do not survive a browser restart, so pointers from the last session
// are stale: close them out and mark their recordings finished.
async function reconcileOrphans() {
  try {
    const all = await chrome.storage.local.get(null)
    const pointerKeys = Object.keys(all).filter((key) => key.startsWith('rewind:session:'))
    for (const key of pointerKeys) {
      const recording = await getRecording(all[key])
      if (recording?.active) {
        recording.active = false
        await saveRecording(recording)
      }
    }
    if (pointerKeys.length) await chrome.storage.local.remove(pointerKeys)
  } catch { /* best effort */ }
}
chrome.runtime.onStartup?.addListener(() => { void reconcileOrphans() })

// Matches ignoring query string / hash, since those often change from normal
// interaction (search boxes, client-side routers) without meaning "different page".
function sameLocation(a, b) {
  try {
    const left = new URL(a)
    const right = new URL(b)
    return left.origin === right.origin && left.pathname === right.pathname
  } catch {
    return a === b
  }
}

async function findOpenTabFor(url) {
  const tabs = await chrome.tabs.query({})
  return tabs.find((tab) => tab.url && sameLocation(tab.url, url))
}

// Rewind is intentionally scoped to what the extension's current permissions
// (activeTab + scripting + tabs, no broad host permission) can honestly do:
//   - find or open the tab for the event's page and focus it (always works)
//   - restore scroll position, but ONLY if that tab still has our content
//     script resident (i.e. it hasn't navigated/reloaded since). We message
//     the existing content script rather than injecting a new one, since
//     injecting into an arbitrary tab we didn't just get activeTab for would
//     need a broader host permission this project deliberately doesn't request.
async function rewindTo(recordingId, eventId) {
  const recording = await getRecording(recordingId)
  if (!recording) throw new Error('Recording not found.')
  const event = recording.events.find((item) => item.id === eventId)
  if (!event) throw new Error('Event not found.')
  const targetUrl = event.url || recording.source?.url
  if (!targetUrl) throw new Error('This event has no page URL to rewind to.')

  const existing = await findOpenTabFor(targetUrl)
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true })
    if (existing.windowId !== undefined) await chrome.windows.update(existing.windowId, { focused: true })
    const scrollY = typeof event.scrollY === 'number' ? event.scrollY : 0
    try {
      await chrome.tabs.sendMessage(existing.id, { type: 'REWIND_SCROLL_TO', scrollY })
      return { ok: true, tabId: existing.id, scrolledTo: scrollY }
    } catch {
      return { ok: true, tabId: existing.id, scrolledTo: null, note: `Opened ${safeHost(targetUrl)} — it reloaded since recording, so REWIND couldn't restore the scroll position.` }
    }
  }

  const created = await chrome.tabs.create({ url: targetUrl, active: true })
  return { ok: true, tabId: created.id, scrolledTo: null, note: `Opened ${safeHost(targetUrl)} in a new tab. Scroll restoration only works on tabs that are still open from the recording.` }
}

// v5.0 workspace resurrection: reopen the browser tabs of an earlier moment.
// Called from extension pages only (the Timeline page, or a future daemon
// bridge). Same permission scope as rewindTo: focus tabs that are still open
// (and restore their scroll), open the rest in the background.
const MAX_RESTORE_TABS = 12

async function restoreTabs(tabs) {
  if (!Array.isArray(tabs)) throw new Error('tabs must be an array.')
  const results = []
  const wanted = tabs.slice(0, MAX_RESTORE_TABS)
  for (let i = 0; i < wanted.length; i++) {
    const item = wanted[i]
    let url
    try {
      const parsed = new URL(item?.url)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('scheme')
      parsed.username = ''
      parsed.password = ''
      url = parsed.href
    } catch {
      results.push({ url: String(item?.url ?? ''), ok: false, note: 'Only http(s) addresses can be restored.' })
      continue
    }
    const last = i === wanted.length - 1
    const existing = await findOpenTabFor(url)
    if (existing?.id) {
      if (last) await chrome.tabs.update(existing.id, { active: true })
      const scrollY = typeof item.scrollY === 'number' ? item.scrollY : null
      let scrolled = null
      if (scrollY !== null) {
        try { await chrome.tabs.sendMessage(existing.id, { type: 'REWIND_SCROLL_TO', scrollY }); scrolled = scrollY } catch { /* reloaded since */ }
      }
      results.push({ url, ok: true, tabId: existing.id, reused: true, scrolledTo: scrolled })
    } else {
      const created = await chrome.tabs.create({ url, active: last })
      results.push({ url, ok: true, tabId: created.id, reused: false, scrolledTo: null })
    }
  }
  return { ok: true, results, skipped: Math.max(0, tabs.length - wanted.length) }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  ;(async () => {
    switch (message.type) {
      case 'REWIND_EVENT': {
        if (!sender.tab?.id || !message.event) { sendResponse({ ok: false }); return }
        await queueSessionEvent(sender.tab.id, message.event)
        sendResponse({ ok: true })
        return
      }

      case 'POPUP_STATUS': {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        const recording = tab?.id ? await getActiveSession(tab.id) : null
        sendResponse({ tab, recording })
        return
      }

      case 'POPUP_START': {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        sendResponse({ recording: await startRecording(tab) })
        return
      }

      case 'POPUP_STOP': {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        sendResponse({ recording: await stopRecording(tab.id) })
        return
      }

      case 'POPUP_EXPORT': {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        const activeId = tab?.id ? await getActiveSessionId(tab.id) : null
        const index = await readIndex()
        const recording = activeId ? await getRecording(activeId) : (index[0] ? await getRecording(index[0].id) : null)
        sendResponse({ recording: recording || null })
        return
      }

      case 'HISTORY_LIST': {
        sendResponse({ recordings: await readIndex() })
        return
      }

      case 'HISTORY_GET': {
        sendResponse({ recording: (await getRecording(message.id)) || null })
        return
      }

      case 'HISTORY_DELETE': {
        await chrome.storage.local.remove(recordingKey(message.id))
        await removeFromIndex(message.id)
        sendResponse({ ok: true })
        return
      }

      case 'HISTORY_CLEAR': {
        const index = await readIndex()
        if (index.length) await chrome.storage.local.remove(index.map((item) => recordingKey(item.id)))
        await writeIndex([])
        sendResponse({ ok: true })
        return
      }

      case 'REWIND_TO': {
        sendResponse(await rewindTo(message.recordingId, message.eventId))
        return
      }

      case 'REWIND_RESTORE_TABS': {
        // Content scripts run inside web pages; never let a page drive tab creation.
        if (sender.tab) throw new Error('REWIND_RESTORE_TABS is only accepted from extension pages.')
        sendResponse(await restoreTabs(message.tabs))
        return
      }
    }
  })().catch((error) => sendResponse({ error: error instanceof Error ? error.message : 'Unexpected extension error' }))
  return true
})

void drainPending()
