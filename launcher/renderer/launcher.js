/**
 * REWIND Launcher — launcher.js (renderer)
 * Handles version list, detail panel, download flow, and launch.
 */
/* global launcher */

'use strict'

// ─── State ────────────────────────────────────────────────────────────────────
let allReleases = []
let selectedRelease = null
let currentFilter = 'all'
let isDownloading = false
let removeProgressListener = null

// ─── DOM refs ────────────────────────────────────────────────────────────────
const elVersionList   = document.getElementById('version-list')
const elLoadingState  = document.getElementById('loading-state')
const elDetailEmpty   = document.getElementById('detail-empty')
const elDetailContent = document.getElementById('detail-content')
const elDetailTag     = document.getElementById('detail-tag')
const elDetailName    = document.getElementById('detail-name')
const elDetailMeta    = document.getElementById('detail-meta')
const elDetailNotes   = document.getElementById('detail-notes')
const elProgressWrap  = document.getElementById('progress-wrap')
const elProgressLabel = document.getElementById('progress-label')
const elProgressFill  = document.getElementById('progress-bar-fill')
const elProgressPct   = document.getElementById('progress-pct')
const elBtnLaunch     = document.getElementById('btn-launch')
const elBtnDownload   = document.getElementById('btn-download')
const elBtnDelete     = document.getElementById('btn-delete')
const elNoAsset       = document.getElementById('no-asset-msg')
const elStatus        = document.getElementById('status-text')
const elStatusRight   = document.getElementById('statusbar-right')
const elOfflineBanner = document.getElementById('offline-banner')
const elBtnRefresh    = document.getElementById('btn-refresh')

// ─── Helpers ─────────────────────────────────────────────────────────────────
function setStatus(msg) { elStatus.textContent = msg }

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatBytes(bytes) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`
}

// ─── Filter releases ─────────────────────────────────────────────────────────
function getFiltered() {
  if (currentFilter === 'installed') return allReleases.filter(r => r.installed)
  if (currentFilter === 'latest')    return allReleases.slice(0, 3)
  return allReleases
}

// ─── Render version list ─────────────────────────────────────────────────────
function renderList() {
  const releases = getFiltered()
  elVersionList.innerHTML = ''

  if (releases.length === 0) {
    elVersionList.innerHTML = `<div class="loading-state" style="color:var(--text-dim)">No versions match this filter.</div>`
    return
  }

  releases.forEach((r, idx) => {
    const isFirst = idx === 0
    const card = document.createElement('div')
    card.className = 'version-card' + (selectedRelease?.tag === r.tag ? ' selected' : '')
    card.dataset.tag = r.tag

    const dotClass = r.installed ? 'installed' : (isFirst ? 'latest' : '')
    const badges = []
    if (isFirst && !r.prerelease) badges.push('<span class="version-badge badge-latest">Latest</span>')
    if (r.prerelease)             badges.push('<span class="version-badge badge-prerelease">Pre-release</span>')
    if (r.installed)              badges.push('<span class="version-badge badge-installed">✓ Installed</span>')

    card.innerHTML = `
      <div class="version-dot ${dotClass}"></div>
      <div class="version-card-info">
        <div class="version-card-tag">${r.tag}</div>
        <div class="version-card-date">${formatDate(r.published)}</div>
      </div>
      ${badges.join('')}
    `
    card.addEventListener('click', () => selectRelease(r))
    elVersionList.appendChild(card)
  })
}

// ─── Select a release (show detail) ──────────────────────────────────────────
function selectRelease(r) {
  selectedRelease = r
  renderList() // re-render to update selected highlight

  elDetailEmpty.style.display   = 'none'
  elDetailContent.style.display = 'flex'
  elProgressWrap.style.display  = 'none'

  elDetailTag.textContent  = r.tag
  elDetailName.textContent = r.name !== r.tag ? r.name : ''
  elDetailMeta.innerHTML   = [
    r.published ? `<span>📅 ${formatDate(r.published)}</span>` : '',
    r.zipAsset  ? `<span>💾 ${formatBytes(r.zipAsset.size)}</span>` : '',
    r.prerelease ? `<span style="color:var(--amber)">⚠ Pre-release</span>` : ''
  ].filter(Boolean).join('')

  elDetailNotes.textContent = r.body
    ? r.body.replace(/\r\n/g, '\n').trim()
    : 'No release notes provided.'

  // Show appropriate action buttons
  elBtnLaunch.style.display   = 'none'
  elBtnDownload.style.display = 'none'
  elBtnDelete.style.display   = 'none'
  elNoAsset.style.display     = 'none'

  if (r.installed) {
    elBtnLaunch.style.display = 'inline-flex'
    elBtnDelete.style.display = 'inline-flex'
  } else if (r.zipAsset) {
    elBtnDownload.style.display = 'inline-flex'
  } else {
    elNoAsset.style.display = 'block'
  }

  elStatusRight.textContent = r.zipAsset
    ? `Asset: ${r.zipAsset.name}`
    : 'No win-x64 asset found'
}

// ─── Fetch releases from GitHub ──────────────────────────────────────────────
async function fetchReleases() {
  elLoadingState.style.display = 'flex'
  elVersionList.innerHTML = ''
  elVersionList.appendChild(elLoadingState)
  setStatus('Fetching releases from GitHub…')
  elBtnRefresh.classList.add('spinning')

  try {
    const result = await launcher.fetchReleases()

    if (result.error) {
      // Could be offline — try showing installed only
      elOfflineBanner.style.display = 'block'
      const installed = await launcher.getInstalled()
      allReleases = installed.map(tag => ({
        tag, name: tag, body: '', published: null,
        prerelease: false, draft: false, zipAsset: null, installed: true
      }))
      setStatus('Offline — showing installed versions only')
    } else {
      elOfflineBanner.style.display = 'none'
      allReleases = result
      setStatus(`${allReleases.length} release(s) found`)
    }
  } catch (err) {
    elOfflineBanner.style.display = 'block'
    setStatus('Failed to fetch releases: ' + err.message)
    allReleases = []
  }

  elLoadingState.style.display = 'none'
  elBtnRefresh.classList.remove('spinning')

  renderList()

  // Auto-select last used or latest
  if (allReleases.length > 0) {
    const config = await launcher.getConfig()
    const last = allReleases.find(r => r.tag === config.lastVersion)
    selectRelease(last || allReleases[0])
  }

  // Update version count in statusbar
  const installedCount = allReleases.filter(r => r.installed).length
  elStatusRight.textContent = `${installedCount} installed`
}

// ─── Download a version ───────────────────────────────────────────────────────
async function startDownload(r) {
  if (isDownloading) return
  isDownloading = true

  elBtnDownload.disabled = true
  elProgressWrap.style.display = 'block'
  elProgressLabel.textContent = `Downloading ${r.tag}…`
  elProgressFill.style.width  = '0%'
  elProgressPct.textContent   = '0%'
  setStatus(`Downloading ${r.tag} (${formatBytes(r.zipAsset.size)})…`)

  // Subscribe to progress events
  if (removeProgressListener) removeProgressListener()
  removeProgressListener = launcher.onDownloadProgress(data => {
    if (data.tag !== r.tag) return
    if (data.phase === 'extracting') {
      elProgressLabel.textContent = `Extracting ${r.tag}…`
      elProgressFill.style.width  = '100%'
      elProgressPct.textContent   = 'Extracting…'
      setStatus(`Extracting ${r.tag}…`)
    } else {
      elProgressFill.style.width = `${data.pct}%`
      elProgressPct.textContent  = `${data.pct}%  (${formatBytes(data.received)} / ${formatBytes(data.total)})`
    }
  })

  const result = await launcher.downloadVersion(r.tag, r.zipAsset.url, r.zipAsset.name)

  if (removeProgressListener) { removeProgressListener(); removeProgressListener = null }
  isDownloading = false
  elBtnDownload.disabled = false
  elProgressWrap.style.display = 'none'

  if (result.error) {
    setStatus(`❌ Download failed: ${result.error}`)
    return
  }

  setStatus(`✅ ${r.tag} installed`)

  // Update installed state and re-render
  r.installed = true
  renderList()
  selectRelease(r)
}

// ─── Launch a version ─────────────────────────────────────────────────────────
async function launchVersion(r) {
  setStatus(`Launching ${r.tag}…`)
  elBtnLaunch.disabled = true

  const result = await launcher.launchVersion(r.tag)

  elBtnLaunch.disabled = false
  if (result.error) {
    setStatus(`❌ Launch failed: ${result.error}`)
  } else {
    setStatus(`✅ ${r.tag} launched`)
  }
}

// ─── Delete a version ─────────────────────────────────────────────────────────
async function deleteVersion(r) {
  if (!confirm(`Remove REWIND ${r.tag}? This deletes the installed files.`)) return
  setStatus(`Removing ${r.tag}…`)

  const result = await launcher.deleteVersion(r.tag)
  if (result.error) {
    setStatus(`❌ Remove failed: ${result.error}`)
    return
  }

  r.installed = false
  setStatus(`Removed ${r.tag}`)
  renderList()
  selectRelease(r)
}

// ─── Event listeners ─────────────────────────────────────────────────────────
document.getElementById('btn-minimize').addEventListener('click', () => launcher.minimize())
document.getElementById('btn-close').addEventListener('click',    () => launcher.close())
document.getElementById('btn-open-releases').addEventListener('click', () => launcher.openReleases())
document.getElementById('link-releases')?.addEventListener('click', (e) => { e.preventDefault(); launcher.openReleases() })

elBtnRefresh.addEventListener('click', fetchReleases)

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    tab.classList.add('active')
    currentFilter = tab.dataset.filter
    renderList()
  })
})

elBtnLaunch.addEventListener('click',   () => selectedRelease && launchVersion(selectedRelease))
elBtnDownload.addEventListener('click', () => selectedRelease && startDownload(selectedRelease))
elBtnDelete.addEventListener('click',   () => selectedRelease && deleteVersion(selectedRelease))

// ─── Init ─────────────────────────────────────────────────────────────────────
fetchReleases()
