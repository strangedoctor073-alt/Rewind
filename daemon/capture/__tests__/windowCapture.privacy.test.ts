/** Ghost Shield + window identity in the capture engine (no module mocks, real temp dir). */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { WindowCaptureEngine } from '../windowCapture.js'

function driver(info?: { title: string; processName: string; processPath?: string; pid?: number }) {
  let pixelReads = 0
  return {
    get pixelReads() { return pixelReads },
    getActiveWindowHandle: () => 4242,
    getWindowDimensions: () => ({ width: 64, height: 64, x: 30, y: 40 }),
    captureWindowPixels: () => { pixelReads += 1; return new Uint8Array(64 * 64 * 4).fill(150) },
    getWindowInfo: info ? () => info : undefined,
  }
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'rewind-cap-'))

describe('WindowCaptureEngine privacy and identity', () => {
  it('never reads pixels from a password manager', async () => {
    const d = driver({ title: 'Vault', processName: 'KeePassXC.exe' })
    const engine = new WindowCaptureEngine({ storageDir: tmp(), nativeDriver: d })
    expect(await engine.captureActiveWindow('m1')).toBeNull()
    expect(d.pixelReads).toBe(0)
  })

  it('never reads pixels from an incognito window', async () => {
    const d = driver({ title: 'New Incognito Tab - Google Chrome', processName: 'chrome.exe' })
    const engine = new WindowCaptureEngine({ storageDir: tmp(), nativeDriver: d })
    expect(await engine.captureActiveWindow('m2')).toBeNull()
    expect(d.pixelReads).toBe(0)
  })

  it('records the real window title, process and geometry for allowed windows', async () => {
    const d = driver({ title: 'auth.ts - Rewind - Visual Studio Code', processName: 'Code.exe', processPath: 'C:\\VSCode\\Code.exe', pid: 77 })
    const engine = new WindowCaptureEngine({ storageDir: tmp(), nativeDriver: d })
    const frame = await engine.captureActiveWindow('m3')
    expect(frame).toMatchObject({
      windowTitle: 'auth.ts - Rewind - Visual Studio Code', processName: 'Code.exe', processPath: 'C:\\VSCode\\Code.exe', pid: 77, x: 30, y: 40,
    })
  })

  it('without a native driver (non-Windows) captures nothing instead of inventing a frame', async () => {
    if (process.platform === 'win32') return // on Windows the real driver would run
    const engine = new WindowCaptureEngine({ storageDir: tmp() })
    expect(await engine.captureActiveWindow('m4')).toBeNull()
  })
})
