/**
 * REWIND Desktop Ultimate - Floating HUD & Time Machine Client
 * Features:
 * - Tactile synthesized mechanical ticks on scrubber movement
 * - Smooth Video & Visual Replay Engine with variable speeds (0.5x, 1x, 2x, 4x)
 * - Deep State Resurrection for terminals with executed-command disclaimer
 * - 1-Click 5-second animated GIF exporter
 * - Inbuilt Productivity & Activity Stats Dashboard (focus score, deep work, context switches, app distribution)
 * - Multi-checkpoint snapshot manager & encrypted disaster recovery export/import
 * - Privacy-screened clipboard history
 */

// Sandboxed renderer: the allow-listed IPC bridge comes from desktop/preload.cjs
const ipcRenderer = window.rewind

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
const tabStats = document.querySelector('#tab-stats')
const tabBackups = document.querySelector('#tab-backups')
const clipCountBadge = document.querySelector('#clip-count-badge')
const checkpointCountBadge = document.querySelector('#checkpoint-count-badge')

// Content Panels
const filmstripContainer = document.querySelector('#filmstrip-container')
const filmstripTrack = document.querySelector('#filmstrip-track')
const clipboardPanel = document.querySelector('#clipboard-panel')
const clipboardList = document.querySelector('#clipboard-list')
const statsPanel = document.querySelector('#stats-panel')
const backupsPanel = document.querySelector('#backups-panel')

// Video Replay Controls
const videoPlayBtn = document.querySelector('#video-play-btn')
const videoPlayIcon = document.querySelector('#video-play-icon')
const videoPlayLabel = document.querySelector('#video-play-label')
const videoStepBackBtn = document.querySelector('#video-step-back-btn')
const videoStepFwdBtn = document.querySelector('#video-step-fwd-btn')
const videoScrubberSlider = document.querySelector('#video-scrubber-slider')
const videoTimeCounter = document.querySelector('#video-time-counter')
const speedBtns = document.querySelectorAll('.speed-btn')

// Stats Elements
const statFocusScore = document.querySelector('#stat-focus-score')
const statFocusDesc = document.querySelector('#stat-focus-desc')
const statActiveTime = document.querySelector('#stat-active-time')
const statDeepworkTime = document.querySelector('#stat-deepwork-time')
const statSwitches = document.querySelector('#stat-switches')
const statSwitchRate = document.querySelector('#stat-switch-rate')
const statRescues = document.querySelector('#stat-rescues')
const statRescueBreakdown = document.querySelector('#stat-rescue-breakdown')
const statsAppsList = document.querySelector('#stats-apps-list')
const statResetBtn = document.querySelector('#stat-reset-btn')

// Checkpoint Elements
const checkpointLabelInput = document.querySelector('#checkpoint-label-input')
const createCheckpointBtn = document.querySelector('#create-checkpoint-btn')
const exportBackupBtn = document.querySelector('#export-backup-btn')
const checkpointsList = document.querySelector('#checkpoints-list')

// Action Tools
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
let allCheckpoints = []

// Video Replay State
let isPlaying = false
let replayIndex = 0
let playbackSpeed = 1
let replayTimer = null

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

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '0m'
  const totalSec = Math.floor(ms / 1000)
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

// -----------------------------------------------------------------------------
// Filmstrip Rendering
// -----------------------------------------------------------------------------
function getFilteredEvents() {
  let filtered = allEvents

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

  if (currentFilter === 'recent') {
    const fifteenMinAgo = Date.now() - 15 * 60 * 1000
    filtered = filtered.filter((e) => e.timestamp >= fifteenMinAgo)
  } else if (currentFilter === 'closed') {
    filtered = filtered.filter((e) => e.kind === 'window-closed')
  } else if (currentFilter === 'terminals') {
    filtered = filtered.filter((e) => isTerminalProcess(e.processName))
  }

  return filtered
}

function renderFilmstrip() {
  filmstripTrack.innerHTML = ''
  const filtered = getFilteredEvents()

  tmEventCount.textContent = `${filtered.length} moment${filtered.length === 1 ? '' : 's'}`

  if (filtered.length === 0) {
    filmstripTrack.innerHTML = `
      <div style="color: var(--text-muted); font-size: 13px; padding: 40px; text-align: center; width: 100%;">
        No moments found matching your criteria.
      </div>`
    videoScrubberSlider.max = 0
    videoScrubberSlider.value = 0
    videoTimeCounter.textContent = '00:00 / 00:00'
    return
  }

  videoScrubberSlider.max = Math.max(0, filtered.length - 1)
  updateScrubberTimeDisplay(filtered)

  filtered.forEach((event, idx) => {
    const card = document.createElement('div')
    const isTerm = isTerminalProcess(event.processName)
    card.className = `tm-card kind-${event.kind === 'window-closed' ? 'closed' : 'focus'} ${isTerm ? 'is-terminal' : ''}`
    card.dataset.index = idx

    const boundsStr = event.bounds
      ? `${event.bounds.width}×${event.bounds.height} @ (${event.bounds.x}, ${event.bounds.y})`
      : 'Full Screen'

    const stateBadgeHtml = event.hasFullState || isTerm
      ? `<div class="tm-state-badge" title="Full state (scrollback, environment, cwd) preserved">
           <span class="badge-icon">⚡</span>
           <span>Relaunchable</span>
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
    card.querySelector('.jump-btn').addEventListener('click', (e) => {
      e.stopPropagation()
      playResurrectSound()
      showToast(`Resurrecting ${event.processName}...`)
      ipcRenderer.send('restore-moment', event)
    })

    // Copy Context action
    card.querySelector('.copy-ctx-btn').addEventListener('click', (e) => {
      e.stopPropagation()
      const textToCopy = `${event.processName} | ${event.title}\nExecutable: ${event.exePath || 'N/A'}`
      ipcRenderer.send('copy-to-clipboard', textToCopy)
      showToast('Copied window context!')
    })

    card.addEventListener('click', () => {
      seekToMomentIndex(idx)
    })

    filmstripTrack.appendChild(card)
  })

  highlightActiveCard()
}

// -----------------------------------------------------------------------------
// Video & Visual Replay Engine
// -----------------------------------------------------------------------------
function updateScrubberTimeDisplay(eventsList) {
  const currentNum = replayIndex + 1
  const totalNum = eventsList.length
  videoTimeCounter.textContent = `${String(currentNum).padStart(2, '0')} / ${String(totalNum).padStart(2, '0')} moments`
  videoScrubberSlider.value = replayIndex
}

function seekToMomentIndex(idx) {
  const events = getFilteredEvents()
  if (events.length === 0) return
  replayIndex = Math.max(0, Math.min(events.length - 1, idx))
  updateScrubberTimeDisplay(events)
  highlightActiveCard()
  playTickSound()
}

function highlightActiveCard() {
  const cards = filmstripTrack.querySelectorAll('.tm-card')
  cards.forEach((c) => c.classList.remove('is-active-moment'))

  const target = filmstripTrack.querySelector(`.tm-card[data-index="${replayIndex}"]`)
  if (target) {
    target.classList.add('is-active-moment')
    target.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
  }
}

function startVideoPlayback() {
  if (isPlaying) return
  isPlaying = true
  videoPlayIcon.textContent = '⏸'
  videoPlayLabel.textContent = 'Pause'
  videoPlayBtn.classList.add('is-playing')

  const interval = Math.max(300, Math.floor(1800 / playbackSpeed))
  replayTimer = setInterval(() => {
    const events = getFilteredEvents()
    if (events.length === 0) {
      stopVideoPlayback()
      return
    }

    if (replayIndex >= events.length - 1) {
      // Reached the end, loop or pause
      replayIndex = 0
    } else {
      replayIndex++
    }

    seekToMomentIndex(replayIndex)
  }, interval)
}

function stopVideoPlayback() {
  if (!isPlaying) return
  isPlaying = false
  if (replayTimer) clearInterval(replayTimer)
  replayTimer = null
  videoPlayIcon.textContent = '▶'
  videoPlayLabel.textContent = 'Play'
  videoPlayBtn.classList.remove('is-playing')
}

videoPlayBtn.addEventListener('click', () => {
  if (isPlaying) stopVideoPlayback()
  else startVideoPlayback()
})

videoStepBackBtn.addEventListener('click', () => {
  stopVideoPlayback()
  seekToMomentIndex(replayIndex - 1)
})

videoStepFwdBtn.addEventListener('click', () => {
  stopVideoPlayback()
  seekToMomentIndex(replayIndex + 1)
})

videoScrubberSlider.addEventListener('input', (e) => {
  stopVideoPlayback()
  seekToMomentIndex(parseInt(e.target.value, 10))
})

speedBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    speedBtns.forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    playbackSpeed = parseFloat(btn.dataset.speed) || 1
    if (isPlaying) {
      stopVideoPlayback()
      startVideoPlayback()
    }
    showToast(`Playback speed: ${playbackSpeed}x`)
  })
})

// -----------------------------------------------------------------------------
// Productivity & Activity Stats Rendering
// -----------------------------------------------------------------------------
function renderProductivityStats(data) {
  if (!data) return

  statFocusScore.textContent = data.focusScore ?? '--'
  if (data.focusScore >= 80) {
    statFocusDesc.textContent = '🔥 Excellent deep work focus!'
  } else if (data.focusScore >= 60) {
    statFocusDesc.textContent = '⚡ Balanced productive session'
  } else {
    statFocusDesc.textContent = '⚠️ High context-switching detected'
  }

  statActiveTime.textContent = formatDuration(data.totalActiveMs)
  statDeepworkTime.textContent = `${data.deepWorkMinutes || 0}m deep focus blocks`

  statSwitches.textContent = data.contextSwitches ?? 0
  statSwitchRate.textContent = `${data.switchesPerHour ?? 0} switches / hr`

  const rescues = data.rescues || { total: 0, undo: 0, terminal: 0, clipboard: 0 }
  statRescues.textContent = rescues.total
  statRescueBreakdown.textContent = `${rescues.undo} undos · ${rescues.terminal} shells · ${rescues.clipboard} clips`

  // Render App Distribution Bars
  statsAppsList.innerHTML = ''
  if (!data.topApps || data.topApps.length === 0) {
    statsAppsList.innerHTML = `<div style="color: var(--text-muted); font-size: 12px; padding: 12px 0;">No active app data tracked yet today.</div>`
    return
  }

  data.topApps.forEach((app) => {
    const row = document.createElement('div')
    row.className = 'app-stat-row'
    row.innerHTML = `
      <div class="app-stat-header">
        <span class="app-stat-name">
          <span>${escapeHtml(app.processName)}</span>
          <span class="app-stat-category ${app.category}">${app.category}</span>
        </span>
        <span class="app-stat-duration">${app.durationMinutes}m (${app.percentage}%)</span>
      </div>
      <div class="app-stat-bar-track">
        <div class="app-stat-bar-fill ${app.category}" style="width: ${Math.max(4, app.percentage)}%;"></div>
      </div>
    `
    statsAppsList.appendChild(row)
  })
}

statResetBtn.addEventListener('click', () => {
  ipcRenderer.send('reset-productivity-stats')
  showToast('Productivity metrics reset for today')
})

ipcRenderer.on('productivity-stats-result', (_event, data) => {
  renderProductivityStats(data)
})

// -----------------------------------------------------------------------------
// Checkpoints & Disaster Recovery Rendering
// -----------------------------------------------------------------------------
function renderCheckpointsList(list) {
  allCheckpoints = Array.isArray(list) ? list : []
  checkpointCountBadge.textContent = allCheckpoints.length
  checkpointsList.innerHTML = ''

  if (allCheckpoints.length === 0) {
    checkpointsList.innerHTML = `
      <div style="color: var(--text-muted); font-size: 13px; padding: 30px; text-align: center;">
        No checkpoints created yet. Save a milestone snapshot to restore from anytime.
      </div>`
    return
  }

  allCheckpoints.forEach((chk) => {
    const card = document.createElement('div')
    card.className = 'chk-card'
    const dateStr = new Date(chk.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const sizeKb = chk.sizeBytes ? `${Math.round(chk.sizeBytes / 1024)} KB` : 'Snapshot'

    card.innerHTML = `
      <div class="chk-info">
        <span class="chk-label">${escapeHtml(chk.label)}</span>
        <span class="chk-meta">${dateStr} (${timeAgo(chk.timestamp)}) · ${chk.eventCount} moments · ${sizeKb}</span>
      </div>
      <div class="chk-actions">
        <button class="chk-restore-btn" title="Restore session to this checkpoint">
          <span>↶</span>
          <span>Restore</span>
        </button>
        <button class="chk-del-btn" title="Delete checkpoint">✕</button>
      </div>
    `

    card.querySelector('.chk-restore-btn').addEventListener('click', () => {
      showToast(`Restoring checkpoint "${chk.label}"...`)
      ipcRenderer.send('restore-checkpoint', chk.id)
    })

    card.querySelector('.chk-del-btn').addEventListener('click', () => {
      ipcRenderer.send('delete-checkpoint', chk.id)
      showToast(`Deleted checkpoint`)
    })

    checkpointsList.appendChild(card)
  })
}

createCheckpointBtn.addEventListener('click', () => {
  const label = checkpointLabelInput.value.trim() || 'Manual Checkpoint'
  ipcRenderer.send('create-checkpoint', label)
  checkpointLabelInput.value = ''
})

exportBackupBtn.addEventListener('click', () => {
  showToast('Exporting encrypted backup bundle...')
  ipcRenderer.send('export-backup-bundle')
})

ipcRenderer.on('checkpoint-created-result', (_event, res) => {
  if (res?.success) {
    showToast(`Saved checkpoint: "${res.checkpoint?.label}"`)
    renderCheckpointsList(res.checkpoints)
  } else {
    showToast(`Error creating checkpoint: ${res?.error}`)
  }
})

ipcRenderer.on('checkpoints-list-result', (_event, list) => {
  renderCheckpointsList(list)
})

ipcRenderer.on('restore-checkpoint-result', (_event, res) => {
  if (res?.success) {
    playResurrectSound()
    showToast(`Restored ${res.eventCount} moments from checkpoint!`)
  } else {
    showToast(`Failed to restore checkpoint: ${res?.error}`)
  }
})

ipcRenderer.on('delete-checkpoint-result', (_event, res) => {
  renderCheckpointsList(res.checkpoints)
})

ipcRenderer.on('export-backup-bundle-result', (_event, res) => {
  if (res?.success) {
    showToast(`Exported .rewind.backup with ${res.checkpointCount} checkpoints to Downloads!`)
  } else {
    showToast(`Export failed: ${res?.error}`)
  }
})

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

// -----------------------------------------------------------------------------
// Time Machine Expand / Collapse & Tab Switching
// -----------------------------------------------------------------------------
function setTimeMachineVisible(expanded) {
  isExpanded = expanded
  if (expanded) {
    tmView.classList.remove('hidden')
    timelineToggleBtn.classList.add('active')
    renderFilmstrip()
    renderClipboardList()
    ipcRenderer.send('get-productivity-stats')
    ipcRenderer.send('get-checkpoints')
    setTimeout(() => tmSearchInput.focus(), 100)
  } else {
    stopVideoPlayback()
    tmView.classList.add('hidden')
    timelineToggleBtn.classList.remove('active')
    tmSearchInput.value = ''
    currentSearch = ''
  }
}

timelineToggleBtn.addEventListener('click', () => {
  ipcRenderer.send('toggle-time-machine')
})

tmCloseBtn.addEventListener('click', () => {
  ipcRenderer.send('toggle-time-machine')
})

function switchTab(targetTab) {
  const tabs = [tabTimeline, tabClipboard, tabStats, tabBackups]
  const panels = [filmstripContainer, clipboardPanel, statsPanel, backupsPanel]

  tabs.forEach((t) => t.classList.remove('active'))
  panels.forEach((p) => p.classList.add('hidden'))

  if (targetTab === 'timeline') {
    tabTimeline.classList.add('active')
    filmstripContainer.classList.remove('hidden')
    renderFilmstrip()
  } else if (targetTab === 'clipboard') {
    tabClipboard.classList.add('active')
    clipboardPanel.classList.remove('hidden')
    renderClipboardList()
  } else if (targetTab === 'stats') {
    tabStats.classList.add('active')
    statsPanel.classList.remove('hidden')
    ipcRenderer.send('get-productivity-stats')
  } else if (targetTab === 'backups') {
    tabBackups.classList.add('active')
    backupsPanel.classList.remove('hidden')
    ipcRenderer.send('get-checkpoints')
  }
}

tabTimeline.addEventListener('click', () => switchTab('timeline'))
tabClipboard.addEventListener('click', () => switchTab('clipboard'))
tabStats.addEventListener('click', () => switchTab('stats'))
tabBackups.addEventListener('click', () => switchTab('backups'))

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
    stopVideoPlayback()
    playTickSound()
    if (e.key === 'ArrowRight') seekToMomentIndex(replayIndex + 1)
    else seekToMomentIndex(replayIndex - 1)
  } else if (isExpanded && e.code === 'Space' && document.activeElement !== tmSearchInput && document.activeElement !== checkpointLabelInput) {
    e.preventDefault()
    if (isPlaying) stopVideoPlayback()
    else startVideoPlayback()
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
