const recordButton = document.querySelector('#record')
const exportButton = document.querySelector('#export')
const status = document.querySelector('#status')
const statusBox = document.querySelector('.status')
const site = document.querySelector('#site')
const message = document.querySelector('#message')

const send = (type) => new Promise((resolve) => chrome.runtime.sendMessage({ type }, resolve))

function showMessage(text) { message.textContent = text }

function update(recording, tab) {
  site.textContent = tab?.url?.startsWith('http') ? new URL(tab.url).hostname : 'Open a normal website to begin'
  const active = Boolean(recording?.active)
  status.textContent = active ? `${recording.events.length} event${recording.events.length === 1 ? '' : 's'} captured` : 'Ready to record this tab'
  statusBox.classList.toggle('recording', active)
  recordButton.textContent = active ? 'Stop recording' : 'Start recording'
  recordButton.classList.toggle('stop', active)
  exportButton.disabled = !recording?.events?.length
}

async function refresh() {
  const result = await send('POPUP_STATUS')
  if (result?.error) { showMessage(result.error); return }
  update(result.recording, result.tab)
}

recordButton.addEventListener('click', async () => {
  recordButton.disabled = true
  const statusResult = await send('POPUP_STATUS')
  const result = await send(statusResult.recording?.active ? 'POPUP_STOP' : 'POPUP_START')
  recordButton.disabled = false
  if (result?.error) showMessage(result.error)
  else showMessage(statusResult.recording?.active ? 'Saved locally in the extension. Export it when ready.' : 'Recording only this tab. Interact with the page, then return here to stop.')
  await refresh()
})

exportButton.addEventListener('click', async () => {
  const result = await send('POPUP_EXPORT')
  if (!result?.recording) { showMessage('No completed recording is available yet.'); return }
  const blob = new Blob([JSON.stringify(result.recording, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'rewind-browser-recording.rewind.json'
  link.click()
  URL.revokeObjectURL(url)
  showMessage('Exported. Use Import recording in the REWIND web app to inspect it.')
})

refresh()
