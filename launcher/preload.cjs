/**
 * REWIND Launcher — preload.cjs
 * Exposes safe IPC bridge to the renderer via contextBridge.
 */
'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('launcher', {
  /** Fetch all GitHub releases */
  fetchReleases: () => ipcRenderer.invoke('fetch-releases'),

  /** Get locally installed versions */
  getInstalled: () => ipcRenderer.invoke('get-installed'),

  /** Download + extract a version. Returns { ok } or { error } */
  downloadVersion: (tag, url, name) => ipcRenderer.invoke('download-version', { tag, url, name }),

  /** Launch an installed version */
  launchVersion: (tag) => ipcRenderer.invoke('launch-version', { tag }),

  /** Delete an installed version */
  deleteVersion: (tag) => ipcRenderer.invoke('delete-version', { tag }),

  /** Get saved launcher config */
  getConfig: () => ipcRenderer.invoke('get-config'),

  /** Listen for download progress events */
  onDownloadProgress: (cb) => {
    const handler = (_, data) => cb(data)
    ipcRenderer.on('download-progress', handler)
    return () => ipcRenderer.removeListener('download-progress', handler)
  },

  /** Window controls */
  minimize: () => ipcRenderer.send('window-minimize'),
  close:    () => ipcRenderer.send('window-close'),
  openReleases: () => ipcRenderer.send('open-releases')
})
