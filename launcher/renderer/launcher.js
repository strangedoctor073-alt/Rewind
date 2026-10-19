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

// ─── DOM References ───────────────────────────────────────────────────────────
const versionListContainer = document.getElementById('version-list')
const loadingState         = document.getElementById('loading-state')
const detailEmptyView      = document.getElementById('detail-empty')
const detailContentView    = document.getElementById('detail-content')
const detailTag            = document.getElementById('detail-tag')
const detailName           = document.getElementById('detail-name')
const detailMeta           = document.getElementById('detail-meta')
const detailNotes          = document.getElementById('detail-notes')
const progressWrapper      = document.getElementById('progress-wrap')
const progressLabel        = document.getElementById('progress-label')
const progressBarFill      = document.getElementById('progress-bar-fill')
const progressPercentage   = document.getElementById('progress-pct')
const btnLaunch            = document.getElementById('btn-launch')
const btnDownload          = document.getElementById('btn-download')
const btnDelete            = document.getElementById('btn-delete')
const noAssetMessage       = document.getElementById('no-asset-msg')
const statusText           = document.getElementById('status-text')
const statusbarRight       = document.getElementById('statusbar-right')
const offlineBanner        = document.getElementById('offline-banner')
const btnRefresh           = document.getElementById('btn-refresh')

// ─── Helpers ─────────────────────────────────────────────────────────────────
function setStatus(msg) {
  statusText.textContent = msg
}

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

// ─── Filter Releases ─────────────────────────────────────────────────────────
function getFiltered() {
  if (currentFilter === 'installed') return allReleases.filter(r => r.installed)
  if (currentFilter === 'latest')    return allReleases.slice(0, 3)
  return allReleases
}

// ─── Render Version List ─────────────────────────────────────────────────────
function renderList() {
  const releases = getFiltered()
  versionListContainer.innerHTML = ''

  if (releases.length === 0) {
    versionListContainer.innerHTML = `<div class="loading-state" style="color:var(--text-dim)">No versions match this filter.</div>`
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
    versionListContainer.appendChild(card)
  })
}

// ─── Select Release ──────────────────────────────────────────────────────────
function selectRelease(r) {
  selectedRelease = r
  renderList()

  detailEmptyView.style.display   = 'none'
  detailContentView.style.display = 'flex'
  progressWrapper.style.display   = 'none'

  detailTag.textContent  = r.tag
  detailName.textContent = r.name !== r.tag ? r.name : ''
  detailMeta.innerHTML   = [
    r.published ? `<span>📅 ${formatDate(r.published)}</span>` : '',
    r.zipAsset  ? `<span>💾 ${formatBytes(r.zipAsset.size)}</span>` : '',
    r.prerelease ? `<span style="color:var(--amber)">Pre-release</span>` : ''
  ].filter(Boolean).join('')

  detailNotes.textContent = r.body
    ? r.body.replace(/\r\n/g, '\n').trim()
    : 'No release notes provided.'

  btnLaunch.style.display   = 'none'
  btnDownload.style.display = 'none'
  btnDelete.style.display   = 'none'
  noAssetMessage.style.display = 'none'

  if (r.installed) {
    btnLaunch.style.display = 'inline-flex'
    btnDelete.style.display = 'inline-flex'
  } else if (r.zipAsset) {
    btnDownload.style.display = 'inline-flex'
  } else {
    noAssetMessage.style.display = 'block'
  }

  statusbarRight.textContent = r.zipAsset
    ? `Asset: ${r.zipAsset.name}`
    : 'No win-x64 asset found'
}

// ─── Fetch Releases ──────────────────────────────────────────────────────────
async function fetchReleases() {
  loadingState.style.display = 'flex'
  versionListContainer.innerHTML = ''
  versionListContainer.appendChild(loadingState)
  setStatus('Fetching releases from GitHub…')
  btnRefresh.classList.add('spinning')

  try {
    const result = await launcher.fetchReleases()

    if (result.error) {
      offlineBanner.style.display = 'block'
      const installed = await launcher.getInstalled()
      allReleases = installed.map(tag => ({
        tag, name: tag, body: '', published: null,
        prerelease: false, draft: false, zipAsset: null, installed: true
      }))
      setStatus('Offline — showing installed versions only')
    } else {
      offlineBanner.style.display = 'none'
      allReleases = result
      setStatus(`${allReleases.length} release(s) found`)
    }
  } catch (err) {
    offlineBanner.style.display = 'block'
    setStatus(`Failed to fetch releases: ${err.message}`)
    allReleases = []
  }

  loadingState.style.display = 'none'
  btnRefresh.classList.remove('spinning')

  renderList()

  if (allReleases.length > 0) {
    const config = await launcher.getConfig()
    const last = allReleases.find(r => r.tag === config.lastVersion)
    selectRelease(last || allReleases[0])
  }

  const installedCount = allReleases.filter(r => r.installed).length
  statusbarRight.textContent = `${installedCount} installed`
}

// ─── Download Version ────────────────────────────────────────────────────────
async function startDownload(r) {
  if (isDownloading) return
  isDownloading = true

  btnDownload.disabled = true
  progressWrapper.style.display = 'block'
  progressLabel.textContent = `Downloading ${r.tag}…`
  progressBarFill.style.width = '0%'
  progressPercentage.textContent = '0%'
  setStatus(`Downloading ${r.tag} (${formatBytes(r.zipAsset.size)})…`)

  if (removeProgressListener) removeProgressListener()
  removeProgressListener = launcher.onDownloadProgress(data => {
    if (data.tag !== r.tag) return
    if (data.phase === 'extracting') {
      progressLabel.textContent = `Extracting ${r.tag}…`
      progressBarFill.style.width = '100%'
      progressPercentage.textContent = 'Extracting…'
      setStatus(`Extracting ${r.tag}…`)
    } else {
      progressBarFill.style.width = `${data.pct}%`
      progressPercentage.textContent = `${data.pct}% (${formatBytes(data.received)} / ${formatBytes(data.total)})`
    }
  })

  const result = await launcher.downloadVersion(r.tag, r.zipAsset.url, r.zipAsset.name)

  if (removeProgressListener) { removeProgressListener(); removeProgressListener = null }
  isDownloading = false
  btnDownload.disabled = false
  progressWrapper.style.display = 'none'

  if (result.error) {
    setStatus(`Download failed: ${result.error}`)
    return
  }

  setStatus(`${r.tag} installed successfully`)

  r.installed = true
  renderList()
  selectRelease(r)
}

// ─── Launch Version ──────────────────────────────────────────────────────────
async function launchVersion(r) {
  setStatus(`Launching ${r.tag}…`)
  btnLaunch.disabled = true

  const result = await launcher.launchVersion(r.tag)

  btnLaunch.disabled = false
  if (result.error) {
    setStatus(`Launch failed: ${result.error}`)
  } else {
    setStatus(`${r.tag} launched`)
  }
}

// ─── Delete Version ──────────────────────────────────────────────────────────
async function deleteVersion(r) {
  if (!confirm(`Remove REWIND ${r.tag}? This deletes the installed files.`)) return
  setStatus(`Removing ${r.tag}…`)

  const result = await launcher.deleteVersion(r.tag)
  if (result.error) {
    setStatus(`Remove failed: ${result.error}`)
    return
  }

  r.installed = false
  setStatus(`${r.tag} removed`)
  renderList()
  selectRelease(r)
}

// ─── Event Listeners ─────────────────────────────────────────────────────────
document.getElementById('btn-minimize').addEventListener('click', () => launcher.minimize())
document.getElementById('btn-close').addEventListener('click', () => launcher.close())
document.getElementById('btn-open-releases').addEventListener('click', () => launcher.openReleases())
document.getElementById('link-releases')?.addEventListener('click', (e) => {
  e.preventDefault()
  launcher.openReleases()
})

btnRefresh.addEventListener('click', fetchReleases)

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
    tab.classList.add('active')
    currentFilter = tab.dataset.filter
    renderList()
  })
})

btnLaunch.addEventListener('click', () => selectedRelease && launchVersion(selectedRelease))
btnDownload.addEventListener('click', () => selectedRelease && startDownload(selectedRelease))
btnDelete.addEventListener('click', () => selectedRelease && deleteVersion(selectedRelease))

// ─── Init ─────────────────────────────────────────────────────────────────────
fetchReleases()
