/**
 * REWIND Desktop Ultimate - Floating HUD & Time Machine Client
 * Features:
 * - Tactile synthesized mechanical ticks on scrubber movement
 * - Deep State Resurrection for terminals with executed-command disclaimer
 * - 1-Click 5-second animated GIF exporter
 * - Instant OCR & title live filtering
 * - Privacy-screened clipboard history
 */

const { ipcRenderer } = require('electron')

// Compact Pill DOM Elements
const appBadge = document.querySelector('#app-badge')
const windowTitle = document.querySelector('#window-title')
const undoBtn = document.querySelector('#undo-btn')
const timelineToggleBtn = document.querySelector('#timeline-toggle-btn')
const pauseBtn = document.querySelector('#pause-btn')
const pauseIcon = document.querySelector('#pause-icon')
const backupBadge = document.querySelector('#backup-badge')
const backupTimer = document.querySelector('#backup-timer')
const recDot = document.querySelector('#rec-dot')

// Time Machine DOM Elements
const tmView = document.querySelector('#time-machine-view')
const tmSearchInput = document.querySelector('#tm-search-input')
const tmEventCount = document.querySelector('#tm-event-count')
const tmCloseBtn = document.querySelector('#tm-close-btn')
const tabTimeline = document.querySelector('#tab-timeline')
const tabClipboard = document.querySelector('#tab-clipboard')
const clipCountBadge = document.querySelector('#clip-count-badge')
const filmstripContainer = document.querySelector('#filmstrip-container')
const filmstripTrack = document.querySelector('#filmstrip-track')
const clipboardPanel = document.querySelector('#clipboard-panel')
const clipboardList = document.querySelector('#clipboard-list')
const presetBtns = document.querySelectorAll('.preset-btn')
const toastContainer = document.querySelector('#toast-container')
const soundToggleBtn = document.querySelector('#sound-toggle-btn')
const soundIcon = document.querySelector('#sound-icon')
const exportGifBtn = document.querySelector('#export-gif-btn')
const terminalDisclaimerBanner = document.querySelector('#terminal-disclaimer-banner')
const dismissDisclaimerBtn = document.querySelector('#dismiss-disclaimer-btn')

let countdown = 20
let isExpanded = false
let isPaused = false
let soundMuted = false
let currentFilter = 'all'
let currentSearch = ''
let allEvents = []
let allClipboards = []

// -----------------------------------------------------------------------------
// Tactile Audio Synthesis (Zero-Asset Web Audio)
// -----------------------------------------------------------------------------
let audioCtx = null

function getAudioContext() {
  if (audioCtx) return audioCtx
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (Ctx) {
    try {
      audioCtx = new Ctx()
    } catch {
      // suppressed
    }
  }
  return audioCtx
}

function playTickSound() {
  if (soundMuted) return
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(1600, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.02)
    gain.gain.setValueAtTime(0.06, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.02)
  } catch {
    // audio fallback
  }
}

function playResurrectSound() {
  if (soundMuted) return
  const ctx = getAudioContext()
  if (!ctx) return
  try {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(150, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.07)
    osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.14)
    gain.gain.setValueAtTime(0.1, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.14)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.14)
  } catch {
    // audio fallback
  }
}

// -----------------------------------------------------------------------------
// Toast Notification Utility
// -----------------------------------------------------------------------------
function showToast(msg, durationMs = 2400) {
  const toast = document.createElement('div')
  toast.className = 'toast'
  toast.innerHTML = escapeHtml(msg)
  toastContainer.appendChild(toast)
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease'
    toast.style.opacity = '0'
    toast.style.transform = 'translateY(10px)'
    setTimeout(() => toast.remove(), 300)
  }, durationMs)
}

// -----------------------------------------------------------------------------
// Relative Time Formatter
// -----------------------------------------------------------------------------
function timeAgo(ts) {
  if (!ts) return 'Just now'
  const elapsedSec = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (elapsedSec < 30) return 'Just now'
  if (elapsedSec < 60) return `${elapsedSec}s ago`
  const min = Math.floor(elapsedSec / 60)
  if (min < 60) return `${min}m ago`
  const hrs = Math.floor(min / 60)
  return `${hrs}h ago`
}

function isTerminalProcess(procName) {
  if (!procName) return false
  return /^(cmd|powershell|pwsh|windowsterminal|wt|bash|wsl)\.exe$/i.test(procName)
}

// -----------------------------------------------------------------------------
// Filmstrip Rendering
// -----------------------------------------------------------------------------
function renderFilmstrip() {
  filmstripTrack.innerHTML = ''

  let filtered = allEvents

  // Filter by search query
  if (currentSearch.trim()) {
    const q = currentSearch.toLowerCase()
    filtered = filtered.filter(
      (e) =>
        (e.processName && e.processName.toLowerCase().includes(q)) ||
        (e.title && e.title.toLowerCase().includes(q)) ||
        (e.description && e.description.toLowerCase().includes(q)) ||
        (e.stateSummary && e.stateSummary.toLowerCase().includes(q))
    )
  }

  // Filter by preset
  if (currentFilter === 'recent') {
    const fifteenMinAgo = Date.now() - 15 * 60 * 1000
    filtered = filtered.filter((e) => e.timestamp >= fifteenMinAgo)
  } else if (currentFilter === 'closed') {
    filtered = filtered.filter((e) => e.kind === 'window-closed')
  } else if (currentFilter === 'terminals') {
    filtered = filtered.filter((e) => isTerminalProcess(e.processName))
  }

  tmEventCount.textContent = `${filtered.length} moment${filtered.length === 1 ? '' : 's'}`

  if (filtered.length === 0) {
    filmstripTrack.innerHTML = `
      <div style="color: var(--text-muted); font-size: 13px; padding: 40px; text-align: center; width: 100%;">
        No moments found matching your search.
      </div>`
    return
  }

  filtered.forEach((event) => {
    const card = document.createElement('div')
    const isTerm = isTerminalProcess(event.processName)
    card.className = `tm-card kind-${event.kind === 'window-closed' ? 'closed' : 'focus'} ${isTerm ? 'is-terminal' : ''}`

    const boundsStr = event.bounds
      ? `${event.bounds.width}×${event.bounds.height} @ (${event.bounds.x}, ${event.bounds.y})`
      : 'Full Screen'

    const stateBadgeHtml = event.hasFullState || isTerm
      ? `<div class="tm-state-badge" title="Full state (scrollback, environment, cwd) preserved">
           <span class="badge-icon">⚡</span>
           <span>Deep State Saved</span>
         </div>`
      : ''

    card.innerHTML = `
      <div class="tm-card-header">
        <span class="tm-card-proc">${escapeHtml(event.processName || 'Window')}</span>
        <span class="tm-card-time">${timeAgo(event.timestamp)}</span>
      </div>
      <div class="tm-card-body">
        <div class="tm-schematic">
          <div class="tm-schematic-bar">
            <span class="tm-schematic-dot"></span>
            <span class="tm-schematic-dot"></span>
            <span class="tm-schematic-dot"></span>
          </div>
          <div class="tm-schematic-title">${escapeHtml(event.title || 'Active Window')}</div>
          <div class="tm-schematic-geo">${boundsStr}</div>
        </div>
        ${stateBadgeHtml}
        <div class="tm-card-desc">${escapeHtml(event.description || '')}</div>
      </div>
      <div class="tm-card-footer">
        <button class="tm-action-btn jump-btn" title="Relaunch app and restore state">
          <span>↶</span>
          <span>${isTerm ? 'Resurrect Shell' : 'Jump Here'}</span>
        </button>
        <button class="tm-action-btn tm-copy-btn copy-ctx-btn" title="Copy window title and text">
          📋
        </button>
      </div>
    `

    // Jump / Resurrect action
    card.querySelector('.jump-btn').addEventListener('click', () => {
      playResurrectSound()
      showToast(`Resurrecting ${event.processName}...`)
      ipcRenderer.send('restore-moment', event)
    })

    // Copy Context action
    card.querySelector('.copy-ctx-btn').addEventListener('click', () => {
      const textToCopy = `${event.processName} | ${event.title}\nExecutable: ${event.exePath || 'N/A'}`
      ipcRenderer.send('copy-to-clipboard', textToCopy)
      showToast('Copied window context!')
    })

    filmstripTrack.appendChild(card)
  })
}

// -----------------------------------------------------------------------------
// Clipboard Panel Rendering
// -----------------------------------------------------------------------------
function renderClipboardList() {
  clipboardList.innerHTML = ''
  clipCountBadge.textContent = allClipboards.length

  if (allClipboards.length === 0) {
    clipboardList.innerHTML = `
      <div style="color: var(--text-muted); font-size: 13px; padding: 40px; text-align: center;">
        No text copied yet in this session.
      </div>`
    return
  }

  allClipboards.forEach((clip) => {
    const item = document.createElement('div')
    item.className = 'clip-card'
    item.innerHTML = `
      <div class="clip-info">
        <div class="clip-meta">
          <span class="clip-app">${escapeHtml(clip.processName)}</span>
          <span class="clip-time">${timeAgo(clip.timestamp)}</span>
          <span class="clip-time">${clip.charCount} chars</span>
        </div>
        <div class="clip-text">${escapeHtml(clip.text)}</div>
      </div>
      <button class="clip-copy-btn" title="Copy back to clipboard">
        <span>📋</span>
        <span>Copy</span>
      </button>
    `

    item.querySelector('.clip-copy-btn').addEventListener('click', () => {
      ipcRenderer.send('copy-to-clipboard', clip.fullText || clip.text)
      showToast('Copied snippet to clipboard!')
    })

    clipboardList.appendChild(item)
  })
}

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// -----------------------------------------------------------------------------
// Time Machine Expand / Collapse Toggle
// -----------------------------------------------------------------------------
function setTimeMachineVisible(expanded) {
  isExpanded = expanded
  if (expanded) {
    tmView.classList.remove('hidden')
    timelineToggleBtn.classList.add('active')
    renderFilmstrip()
    renderClipboardList()
    setTimeout(() => tmSearchInput.focus(), 100)
  } else {
    tmView.classList.add('hidden')
    timelineToggleBtn.classList.remove('active')
    tmSearchInput.value = ''
    currentSearch = ''
  }
}

// -----------------------------------------------------------------------------
// Event Listeners
// -----------------------------------------------------------------------------
timelineToggleBtn.addEventListener('click', () => {
  ipcRenderer.send('toggle-time-machine')
})

tmCloseBtn.addEventListener('click', () => {
  ipcRenderer.send('toggle-time-machine')
})

// Tab Navigation
tabTimeline.addEventListener('click', () => {
  tabTimeline.classList.add('active')
  tabClipboard.classList.remove('active')
  filmstripContainer.classList.remove('hidden')
  clipboardPanel.classList.add('hidden')
})

tabClipboard.addEventListener('click', () => {
  tabClipboard.classList.add('active')
  tabTimeline.classList.remove('active')
  filmstripContainer.classList.add('hidden')
  clipboardPanel.classList.remove('hidden')
  renderClipboardList()
})

// Live search input filtering
tmSearchInput.addEventListener('input', (e) => {
  currentSearch = e.target.value
  renderFilmstrip()
})

// Preset filter buttons
presetBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    presetBtns.forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    currentFilter = btn.dataset.filter
    renderFilmstrip()
  })
})

// Tactile Sound Toggle
soundToggleBtn.addEventListener('click', () => {
  soundMuted = !soundMuted
  soundIcon.textContent = soundMuted ? '🔇' : '🔊'
  soundToggleBtn.setAttribute('title', soundMuted ? 'Tactile sound muted (Click to enable)' : 'Tactile sound ON (Click to mute)')
  showToast(soundMuted ? 'Muted mechanical sound' : 'Enabled mechanical tick sound')
  if (!soundMuted) playTickSound()
})

// 1-Click 5-Second GIF Moment Exporter
exportGifBtn.addEventListener('click', () => {
  showToast('Generating 5-second animated GIF...')
  exportGifBtn.disabled = true
  ipcRenderer.send('export-moment-gif')
})

ipcRenderer.on('export-moment-gif-result', (_event, res) => {
  exportGifBtn.disabled = false
  if (res?.success) {
    showToast(`Saved 5s GIF: ${res.filePath.split(/[\\/]/).pop()} (${res.frameCount} frames)`)
  } else {
    showToast('Failed to export GIF: ' + (res?.error || 'Unknown error'))
  }
})

// Dismiss Disclaimer
dismissDisclaimerBtn.addEventListener('click', () => {
  terminalDisclaimerBanner.classList.add('hidden')
})

// Tactile sound on horizontal scroll of filmstrip
let lastScrollTime = 0
filmstripContainer.addEventListener('scroll', () => {
  const now = Date.now()
  if (now - lastScrollTime > 60) {
    playTickSound()
    lastScrollTime = now
  }
})

// Privacy Pause toggle
pauseBtn.addEventListener('click', () => {
  ipcRenderer.send('toggle-privacy-pause', 15)
})

// Undo button clicked
let undoFeedbackTimer = null
undoBtn.addEventListener('click', () => {
  undoBtn.style.opacity = '0.7'
  setTimeout(() => {
    undoBtn.style.opacity = '1'
  }, 200)
  ipcRenderer.send('trigger-undo')
})

// Keyboard shortcuts (Escape closes, Ctrl+K focuses search, Arrow keys scrub with tick)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && isExpanded) {
    ipcRenderer.send('toggle-time-machine')
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && isExpanded) {
    e.preventDefault()
    tmSearchInput.focus()
  } else if (isExpanded && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    playTickSound()
    const scrollDelta = e.key === 'ArrowRight' ? 260 : -260
    filmstripContainer.scrollBy({ left: scrollDelta, behavior: 'smooth' })
  }
})

// -----------------------------------------------------------------------------
// IPC Receivers from Main Process
// -----------------------------------------------------------------------------
ipcRenderer.on('active-window-updated', (_event, data) => {
  if (data?.processName) {
    appBadge.textContent = data.processName.replace(/\.exe$/i, '')
  }
  if (data?.title) {
    windowTitle.textContent = data.title
  }
})

ipcRenderer.on('time-machine-state', (_event, data) => {
  if (data.events) allEvents = data.events
  if (data.clipboards) allClipboards = data.clipboards
  isPaused = !!data.isPaused
  updatePauseUI(isPaused)
  setTimeMachineVisible(data.expanded)
})

ipcRenderer.on('new-clipboard-item', (_event, item) => {
  allClipboards.unshift(item)
  renderClipboardList()
})

ipcRenderer.on('restore-moment-result', (_event, res) => {
  if (res?.success) {
    showToast(`Successfully ${res.action || 'restored'}!`)
    // If disclaimer is present (terminal recovery), show notification banner
    if (res.disclaimer) {
      terminalDisclaimerBanner.classList.remove('hidden')
    }
  } else {
    showToast('Could not restore window geometry.')
  }
})

ipcRenderer.on('pause-state-changed', (_event, data) => {
  isPaused = !!data.isPaused
  updatePauseUI(isPaused)
  showToast(isPaused ? 'Paused REWIND recording for 15m' : 'Resumed REWIND recording')
})

function updatePauseUI(paused) {
  if (paused) {
    pauseBtn.classList.add('paused')
    pauseIcon.textContent = '▶'
    pauseBtn.setAttribute('title', 'Resume REWIND recording')
    recDot.parentElement.classList.add('paused')
  } else {
    pauseBtn.classList.remove('paused')
    pauseIcon.textContent = '⏸'
    pauseBtn.setAttribute('title', 'Pause recording (15m)')
    recDot.parentElement.classList.remove('paused')
  }
}

ipcRenderer.on('backup-saved', (_event, _info) => {
  countdown = 20
  backupTimer.textContent = 'Saved'
  backupBadge.classList.add('backup-saved')
  setTimeout(() => {
    backupBadge.classList.remove('backup-saved')
    backupTimer.textContent = '20s'
  }, 1200)
})

ipcRenderer.on('undo-result', (_event, data) => {
  if (undoFeedbackTimer) clearTimeout(undoFeedbackTimer)
  const label = undoBtn.querySelector('span:last-child')

  if (data?.success) {
    undoBtn.classList.remove('undo-failed')
    undoBtn.classList.add('undo-success')
    if (label) label.textContent = 'Undone!'
    undoBtn.setAttribute('title', `Successfully sent Ctrl+Z to ${data.processName || 'window'}`)
  } else {
    undoBtn.classList.remove('undo-success')
    undoBtn.classList.add('undo-failed')
    if (label) label.textContent = 'Failed'
    const target = data?.processName || 'target window'
    undoBtn.setAttribute('title', `Could not switch focus to ${target} within 500ms`)
  }

  undoFeedbackTimer = setTimeout(() => {
    undoBtn.classList.remove('undo-success', 'undo-failed')
    if (label) label.textContent = 'Undo'
    undoBtn.setAttribute('title', 'Undo change in active app (Ctrl+Z)')
  }, 1300)
})

setInterval(() => {
  if (countdown > 1) {
    countdown -= 1
    if (backupTimer.textContent !== 'Saved') {
      backupTimer.textContent = `${countdown}s`
    }
  }
}, 1000)
