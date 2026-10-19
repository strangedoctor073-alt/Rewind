'use strict'
/**
 * REWIND Studio Preload Bridge
 *
 * Exposes a sandboxed, zero-trust API `window.rewindStudio` to the Grand Dashboard
 * running inside Electron.
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('rewindStudio', {
  isDesktopShell: true,

  getAuthToken: () => {
    return ipcRenderer.sendSync('get-daemon-token-sync')
  },

  minimizeToTray: () => {
    ipcRenderer.send('studio-close-action', { action: 'minimize', remember: false })
  },

  exitApp: () => {
    ipcRenderer.send('studio-close-action', { action: 'exit', remember: false })
  },

  sendCloseChoice: (choice) => {
    ipcRenderer.send('studio-close-action', choice)
  },

  toggleHud: () => {
    ipcRenderer.send('toggle-hud')
  },

  openChromeExtensions: () => {
    ipcRenderer.send('open-chrome-extensions')
  },

  getExtensionPath: () => {
    return ipcRenderer.sendSync('get-extension-path-sync')
  },

  onShowCloseDialog: (listener) => {
    const handler = (_event, ...args) => listener(...args)
    ipcRenderer.on('show-close-dialog', handler)
    return () => ipcRenderer.removeListener('show-close-dialog', handler)
  },

  onPrunedNotification: (listener) => {
    const handler = (_event, count) => listener(count)
    ipcRenderer.on('timeline-pruned-notification', handler)
    return () => ipcRenderer.removeListener('timeline-pruned-notification', handler)
  },
})
