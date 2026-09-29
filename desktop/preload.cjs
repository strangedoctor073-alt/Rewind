'use strict'
/**
 * REWIND preload bridge.
 *
 * The overlay renderer runs with contextIsolation ON, nodeIntegration OFF and
 * the Chromium sandbox ON. The only thing it can do with the main process is
 * call the allow-listed channels below through `window.rewind`.
 */
const { contextBridge, ipcRenderer } = require('electron')

const SEND_CHANNELS = new Set([
  'copy-to-clipboard',
  'create-checkpoint',
  'delete-checkpoint',
  'export-backup-bundle',
  'export-moment-gif',
  'get-checkpoints',
  'get-productivity-stats',
  'reset-productivity-stats',
  'restore-checkpoint',
  'restore-moment',
  'toggle-privacy-pause',
  'toggle-time-machine',
  'trigger-undo',
])

const RECEIVE_CHANNELS = new Set([
  'active-window-updated',
  'backup-saved',
  'checkpoint-created-result',
  'checkpoints-list-result',
  'delete-checkpoint-result',
  'export-backup-bundle-result',
  'export-moment-gif-result',
  'new-clipboard-item',
  'pause-state-changed',
  'productivity-stats-result',
  'restore-checkpoint-result',
  'restore-moment-result',
  'time-machine-state',
  'undo-result',
])

contextBridge.exposeInMainWorld('rewind', {
  send(channel, payload) {
    if (!SEND_CHANNELS.has(channel)) throw new Error(`Blocked IPC send channel: ${channel}`)
    ipcRenderer.send(channel, payload)
  },
  on(channel, listener) {
    if (!RECEIVE_CHANNELS.has(channel)) throw new Error(`Blocked IPC receive channel: ${channel}`)
    ipcRenderer.on(channel, (_event, ...args) => listener(null, ...args))
  },
})
