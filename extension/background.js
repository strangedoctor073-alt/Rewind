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

async function readIndex() {
  const result = await chrome.storage.local.get('rewind:index')
  return result['rewind:index'] || []
}

async function writeIndex(index) {
  await chrome.storage.local.set({ 'rewind:index': index })
}

async function upsertIndex(recording) {
  const index = await readIndex()
  await writeIndex([summarize(recording), ...index.filter((item) => item.id !== recording.id)])
}

async function removeFromIndex(id) {
  const index = await readIndex()
  await writeIndex(index.filter((item) => item.id !== id))
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

async function getActiveSessionId(tabId) {
  const result = await chrome.storage.local.get(sessionPointerKey(tabId))
  return result[sessionPointerKey(tabId)]
}

async function getActiveSession(tabId) {
  return getRecording(await getActiveSessionId(tabId))
}

async function startRecording(tab) {
  if (!tab.id || !tab.url?.startsWith('http')) throw new Error('Open a normal http(s) website first. Browser settings and store pages cannot be recorded.')
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
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
  await chrome.tabs.sendMessage(tab.id, { type: 'REWIND_START', sessionId: recording.id })
  return recording
}

async function stopRecording(tabId) {
  const recording = await getActiveSession(tabId)
  if (!recording) throw new Error('No REWIND session exists for this tab.')
  try { await chrome.tabs.sendMessage(tabId, { type: 'REWIND_STOP' }) } catch { /* Tab may have navigated. Stored events remain usable. */ }
  recording.active = false
  recording.duration = Math.max(recording.duration, recording.events.at(-1)?.timestamp || 0)
  await saveRecording(recording)
  await chrome.storage.local.remove(sessionPointerKey(tabId))
  return recording
}

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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  ;(async () => {
    switch (message.type) {
      case 'REWIND_EVENT': {
        if (!sender.tab?.id) return
        const recording = await getActiveSession(sender.tab.id)
        if (recording?.active && message.event) {
          recording.events.push(message.event)
          recording.duration = Math.max(recording.duration, message.event.timestamp || 0)
          await saveRecording(recording)
        }
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
    }
  })().catch((error) => sendResponse({ error: error instanceof Error ? error.message : 'Unexpected extension error' }))
  return true
})
