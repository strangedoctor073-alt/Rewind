const sessionKey = (tabId) => `rewind:session:${tabId}`

const now = () => new Date().toISOString()
const makeStartEvent = () => ({
  id: crypto.randomUUID(), timestamp: 0, kind: 'click', icon: 'START',
  label: 'Recording started', description: 'Capture began in an authorized browser tab',
  category: 'Recording', target: 'browser-tab'
})

async function getSession(tabId) {
  const result = await chrome.storage.local.get(sessionKey(tabId))
  return result[sessionKey(tabId)]
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
  await chrome.storage.local.set({ [sessionKey(tab.id)]: recording })
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] })
  await chrome.tabs.sendMessage(tab.id, { type: 'REWIND_START', sessionId: recording.id })
  return recording
}

async function stopRecording(tabId) {
  const recording = await getSession(tabId)
  if (!recording) throw new Error('No REWIND session exists for this tab.')
  try { await chrome.tabs.sendMessage(tabId, { type: 'REWIND_STOP' }) } catch { /* Tab may have navigated. Stored events remain usable. */ }
  recording.active = false
  recording.duration = Math.max(recording.duration, recording.events.at(-1)?.timestamp || 0)
  await chrome.storage.local.set({ [sessionKey(tabId)]: recording, 'rewind:lastRecording': recording })
  return recording
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  ;(async () => {
    if (message.type === 'REWIND_EVENT' && sender.tab?.id) {
      const recording = await getSession(sender.tab.id)
      if (recording?.active && message.event) {
        recording.events.push(message.event)
        recording.duration = Math.max(recording.duration, message.event.timestamp || 0)
        await chrome.storage.local.set({ [sessionKey(sender.tab.id)]: recording })
      }
      return
    }

    if (message.type === 'POPUP_STATUS') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      const recording = tab?.id ? await getSession(tab.id) : null
      sendResponse({ tab, recording })
      return
    }

    if (message.type === 'POPUP_START') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      sendResponse({ recording: await startRecording(tab) })
      return
    }

    if (message.type === 'POPUP_STOP') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      sendResponse({ recording: await stopRecording(tab.id) })
      return
    }

    if (message.type === 'POPUP_EXPORT') {
      const last = await chrome.storage.local.get('rewind:lastRecording')
      sendResponse({ recording: last['rewind:lastRecording'] || null })
    }
  })().catch((error) => sendResponse({ error: error instanceof Error ? error.message : 'Unexpected extension error' }))
  return true
})
