const recordButton = document.querySelector('#record')
const recordText = document.querySelector('#record-text')
const historyButton = document.querySelector('#history')
const exportButton = document.querySelector('#export')
const statusCard = document.querySelector('#status-card')
const statusHeading = document.querySelector('#status-heading')
const statusSub = document.querySelector('#status')
const site = document.querySelector('#site')
const connectionBadge = document.querySelector('#connection-badge')
const message = document.querySelector('#message')

const send = (type) => new Promise((resolve) => chrome.runtime.sendMessage({ type }, resolve))

function showMessage(text) {
  if (message) message.textContent = text
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0')
  const seconds = (totalSeconds % 60).toString().padStart(2, '0')
  return `${minutes}:${seconds}`
}

function safeHostname(url) {
  try {
    if (!url || !url.startsWith('http')) return null
    return new URL(url).hostname
  } catch {
    return null
  }
}

function update(recording, tab) {
  const host = safeHostname(tab?.url)
  const isWebUrl = Boolean(host)

  if (site) {
    site.textContent = host || 'No webpage active'
  }

  if (connectionBadge) {
    connectionBadge.textContent = isWebUrl ? 'Connected' : 'Unavailable'
    connectionBadge.style.color = isWebUrl ? 'var(--accent)' : 'var(--text-muted)'
  }

  const active = Boolean(recording?.active)
  const eventCount = recording?.events?.length || 0

  if (active) {
    const duration = Math.max(recording.duration || 0, recording.events?.at(-1)?.timestamp || 0)
    statusHeading.textContent = 'Recording in progress'
    statusSub.textContent = `${eventCount} event${eventCount === 1 ? '' : 's'} captured · ${formatDuration(duration)}`
    statusCard.classList.add('recording')
    recordText.textContent = 'Stop recording'
    recordButton.classList.add('recording-active')
  } else {
    statusHeading.textContent = isWebUrl ? 'Ready to record' : 'Open a website to record'
    statusSub.textContent = isWebUrl ? 'Click start to capture clicks, typing & scroll' : 'Browser settings and system tabs cannot be recorded'
    statusCard.classList.remove('recording')
    recordText.textContent = 'Start recording'
    recordButton.classList.remove('recording-active')
  }

  recordButton.disabled = !isWebUrl && !active
  exportButton.disabled = !recording?.events?.length
}

async function refresh() {
  try {
    const result = await send('POPUP_STATUS')
    if (result?.error) {
      showMessage(result.error)
      return
    }
    update(result?.recording, result?.tab)
  } catch {
    showMessage('Extension service worker is initializing...')
  }
}

recordButton.addEventListener('click', async () => {
  recordButton.disabled = true
  try {
    const statusResult = await send('POPUP_STATUS')
    const wasActive = Boolean(statusResult?.recording?.active)
    const result = await send(wasActive ? 'POPUP_STOP' : 'POPUP_START')
    if (result?.error) {
      showMessage(result.error)
    } else {
      showMessage(wasActive ? 'Recording saved locally to history.' : 'Recording active on this tab. Interact freely, then stop.')
    }
  } catch (error) {
    showMessage(error instanceof Error ? error.message : 'Action failed.')
  } finally {
    recordButton.disabled = false
    await refresh()
  }
})

historyButton.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('timeline.html') })
})

exportButton.addEventListener('click', async () => {
  try {
    const result = await send('POPUP_EXPORT')
    if (!result?.recording) {
      showMessage('No completed recording is available yet.')
      return
    }
    const blob = new Blob([JSON.stringify(result.recording, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'rewind-recording.rewind.json'
    link.click()
    URL.revokeObjectURL(url)
    showMessage('Exported latest recording as .rewind.json')
  } catch {
    showMessage('Failed to export recording.')
  }
})

void refresh()
const poller = setInterval(refresh, 1000)
window.addEventListener('unload', () => clearInterval(poller))
