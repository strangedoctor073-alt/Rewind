/**
 * REWIND Launcher — main.cjs
 * Minecraft-style version manager.
 * Fetches GitHub Releases, manages downloads/extraction, launches REWIND.
 */
'use strict'

const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const https = require('node:https')
const { spawn } = require('node:child_process')
const os = require('node:os')

// ─── GitHub Config ────────────────────────────────────────────────────────────
const GITHUB_OWNER = 'strangedoctor073-alt'
const GITHUB_REPO = 'Rewind'
const RELEASES_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`

// ─── Storage paths ────────────────────────────────────────────────────────────
/** Directory where each version is extracted: %APPDATA%\REWIND-Launcher\versions\ */
const versionsDir = path.join(app.getPath('userData'), 'versions')
const configPath  = path.join(app.getPath('userData'), 'launcher-config.json')

// ─── Ensure directories exist ────────────────────────────────────────────────
function ensureDirs() {
  if (!fs.existsSync(versionsDir)) fs.mkdirSync(versionsDir, { recursive: true })
}

// ─── Config helpers ──────────────────────────────────────────────────────────
function readConfig() {
  try { return JSON.parse(fs.readFileSync(configPath, 'utf8')) } catch { return {} }
}
function writeConfig(data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf8')
}

// ─── Window ───────────────────────────────────────────────────────────────────
let win

function createWindow() {
  win = new BrowserWindow({
    width: 720,
    height: 500,
    resizable: false,
    frame: false,
    backgroundColor: '#0f0f13',
    icon: path.join(__dirname, 'renderer', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

app.whenReady().then(() => {
  ensureDirs()
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// ─── HTTP GET helper (follows redirects) ────────────────────────────────────
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = new URL(url)
    const reqHeaders = {
      'User-Agent': `REWIND-Launcher/1.0 (${GITHUB_OWNER}/${GITHUB_REPO})`,
      'Accept': 'application/vnd.github+json',
      ...headers
    }
    function doGet(u) {
      https.get(u, { headers: reqHeaders }, res => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          return doGet(res.headers.location)
        }
        let body = ''
        res.on('data', d => { body += d })
        res.on('end', () => resolve({ status: res.statusCode, body }))
        res.on('error', reject)
      }).on('error', reject)
    }
    doGet(url)
  })
}

// ─── Streaming download with progress ────────────────────────────────────────
function downloadFile(url, destPath, onProgress) {
  return new Promise((resolve, reject) => {
    function doGet(u) {
      https.get(u, {
        headers: { 'User-Agent': `REWIND-Launcher/1.0` }
      }, res => {
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          return doGet(res.headers.location)
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`Download failed: HTTP ${res.statusCode}`))
        }
        const total = parseInt(res.headers['content-length'] || '0', 10)
        let received = 0
        const out = fs.createWriteStream(destPath)
        res.on('data', chunk => {
          received += chunk.length
          out.write(chunk)
          if (total > 0) onProgress(Math.round((received / total) * 100), received, total)
        })
        res.on('end', () => out.end(resolve))
        res.on('error', err => { out.destroy(); reject(err) })
        out.on('error', reject)
      }).on('error', reject)
    }
    doGet(url)
  })
}

// ─── Zip extraction via PowerShell Expand-Archive ────────────────────────────
function extractZip(zipPath, destPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true })
    const ps = spawn('powershell', [
      '-NoProfile', '-NonInteractive', '-Command',
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${destPath}' -Force`
    ])
    let stderr = ''
    ps.stderr.on('data', d => { stderr += d.toString() })
    ps.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`Extraction failed (code ${code}): ${stderr}`))
    })
    ps.on('error', reject)
  })
}

// ─── Find the zip asset in a release ─────────────────────────────────────────
function findZipAsset(release) {
  const assets = release.assets || []
  // Match REWIND-*-win*.zip or REWIND-*.zip (case-insensitive)
  const zip = assets.find(a =>
    /^REWIND[^.]*\.zip$/i.test(a.name) ||
    /^REWIND.*win.*\.zip$/i.test(a.name)
  )
  return zip || null
}

// ─── Check if a version is installed ─────────────────────────────────────────
function isInstalled(version) {
  const exePath = path.join(versionsDir, version, 'REWIND.exe')
  return fs.existsSync(exePath)
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

/** Fetch all releases from GitHub API */
ipcMain.handle('fetch-releases', async () => {
  try {
    const { status, body } = await httpsGet(RELEASES_API)
    if (status !== 200) return { error: `GitHub API returned ${status}` }
    const releases = JSON.parse(body)
    return releases.map(r => ({
      id: r.id,
      tag: r.tag_name,
      name: r.name || r.tag_name,
      body: r.body || '',
      published: r.published_at,
      prerelease: r.prerelease,
      draft: r.draft,
      zipAsset: findZipAsset(r)
        ? { name: findZipAsset(r).name, url: findZipAsset(r).browser_download_url, size: findZipAsset(r).size }
        : null,
      installed: isInstalled(r.tag_name)
    }))
  } catch (err) {
    return { error: err.message }
  }
})

/** Get locally installed versions */
ipcMain.handle('get-installed', () => {
  try {
    if (!fs.existsSync(versionsDir)) return []
    return fs.readdirSync(versionsDir).filter(v => isInstalled(v))
  } catch { return [] }
})

/** Download and extract a release version */
ipcMain.handle('download-version', async (event, { tag, url, name }) => {
  const tmpZip = path.join(os.tmpdir(), `REWIND-${tag}.zip`)
  const destDir = path.join(versionsDir, tag)

  try {
    // Download with progress events
    await downloadFile(url, tmpZip, (pct, received, total) => {
      event.sender.send('download-progress', { tag, pct, received, total })
    })
    event.sender.send('download-progress', { tag, pct: 100, phase: 'extracting' })

    // Extract
    await extractZip(tmpZip, destDir)

    // Cleanup temp zip
    try { fs.unlinkSync(tmpZip) } catch { /* ignore */ }

    // Verify REWIND.exe is present
    if (!isInstalled(tag)) {
      return { error: 'Extraction succeeded but REWIND.exe not found. Check the zip structure.' }
    }
    return { ok: true }
  } catch (err) {
    try { fs.unlinkSync(tmpZip) } catch { /* ignore */ }
    return { error: err.message }
  }
})

/** Launch a specific installed version */
ipcMain.handle('launch-version', async (event, { tag }) => {
  const exePath = path.join(versionsDir, tag, 'REWIND.exe')
  if (!fs.existsSync(exePath)) return { error: 'Not installed' }

  // Save last used version
  const config = readConfig()
  writeConfig({ ...config, lastVersion: tag })

  try {
    const child = spawn(exePath, [], {
      detached: true,
      stdio: 'ignore',
      cwd: path.join(versionsDir, tag)
    })
    child.unref()
    return { ok: true }
  } catch (err) {
    return { error: err.message }
  }
})

/** Delete an installed version */
ipcMain.handle('delete-version', async (event, { tag }) => {
  const destDir = path.join(versionsDir, tag)
  try {
    fs.rmSync(destDir, { recursive: true, force: true })
    return { ok: true }
  } catch (err) {
    return { error: err.message }
  }
})

/** Get launcher config (last used version etc.) */
ipcMain.handle('get-config', () => readConfig())

/** Window controls */
ipcMain.on('window-minimize', () => win?.minimize())
ipcMain.on('window-close',    () => win?.close())

/** Open GitHub releases page in browser */
ipcMain.on('open-releases', () => {
  shell.openExternal(`https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`)
})
