/**
 * REWIND Native Win32 Window & Screen Capture Engine
 * Captures window framebuffers via GDI PrintWindow (PW_RENDERFULLCONTENT = 0x00000002)
 * Computes perceptual visual hashes and writes atomic BMP snapshots.
 *
 * Honesty note: the real Windows driver below (PrintWindow + GetDIBits through
 * Koffi) could not be exercised on a Windows machine when it was written. It
 * degrades to "no frame" (null) on any failure; it never invents pixels. On
 * non-Windows platforms there is no driver and the engine simply captures
 * nothing unless a `nativeDriver` is injected (tests do this).
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createRequire } from 'node:module'
import { computeDHash } from './phash.js'
import { encodeBmp } from './bmp.js'
import { isWindowAllowed } from '../privacy.js'

// `require` does not exist in an ES module. The old code called a bare
// `require('koffi')`, which threw a ReferenceError that was swallowed, so on
// Windows the daemon silently ended up with a driver that never captured.
const nodeRequire = createRequire(import.meta.url)

export interface CapturedFrame {
  id: string
  timestamp: number
  hwnd: number | bigint
  width: number
  height: number
  phash: string
  screenshotPath: string
  isChanged: boolean
  /** Real window identity, present when the driver can report it (always on Windows). */
  windowTitle?: string
  processName?: string
  processPath?: string
  pid?: number
  x?: number
  y?: number
}

export interface CaptureEngineOptions {
  storageDir?: string
  dhashThreshold?: number
  // Dependency injection for unit testing / Linux CI (Trap 7)
  nativeDriver?: {
    getActiveWindowHandle: () => number | bigint | null
    getWindowDimensions: (hwnd: number | bigint) => { width: number; height: number; x: number; y: number }
    captureWindowPixels: (hwnd: number | bigint, width: number, height: number) => Uint8Array | null
    /** Optional: lets the Ghost Shield veto sensitive windows before any pixels are read. */
    getWindowInfo?: (hwnd: number | bigint) => { title: string; processName: string; processPath?: string; pid?: number }
  }
}

export class WindowCaptureEngine {
  private readonly storageDir: string
  private readonly dhashThreshold: number
  private readonly nativeDriver: NonNullable<CaptureEngineOptions['nativeDriver']>
  private lastPhash: string = ''

  constructor(options: CaptureEngineOptions = {}) {
    this.storageDir = options.storageDir ?? path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
      'Rewind',
      'screenshots'
    )
    this.dhashThreshold = options.dhashThreshold ?? 4
    this.nativeDriver = options.nativeDriver ?? this.createDefaultNativeDriver()

    try {
      fs.mkdirSync(this.storageDir, { recursive: true })
    } catch {
      // transient fs error
    }
  }

  /**
   * Captures the current active foreground window, computes its pHash,
   * and persists a BMP snapshot if the visual contents changed.
   */
  async captureActiveWindow(momentId?: string): Promise<CapturedFrame | null> {
    const hwnd = this.nativeDriver.getActiveWindowHandle()
    if (!hwnd) return null

    // Ghost Shield: check BEFORE reading pixels so a password manager or
    // incognito window is never even rendered into memory, let alone saved.
    const info = this.nativeDriver.getWindowInfo?.(hwnd)
    if (info && !isWindowAllowed(info.processName, info.title)) return null

    const bounds = this.nativeDriver.getWindowDimensions(hwnd)
    const width = Math.max(16, Math.min(3840, bounds.width))
    const height = Math.max(16, Math.min(2160, bounds.height))

    const pixels = this.nativeDriver.captureWindowPixels(hwnd, width, height)
    if (!pixels || pixels.length === 0) return null

    const phash = computeDHash(pixels, width, height, 4)
    const isChanged = !this.lastPhash || this.isVisualDifference(this.lastPhash, phash)

    const id = momentId ?? `cap-${Date.now()}`
    const fileName = `${id}.bmp`
    const filePath = path.join(this.storageDir, fileName)

    if (isChanged) {
      this.lastPhash = phash
      // Write snapshot atomically (Trap 6)
      const bmpBuffer = encodeBmp(pixels, width, height, 4)
      const tmpPath = filePath + '.tmp'
      try {
        fs.writeFileSync(tmpPath, bmpBuffer)
        fs.renameSync(tmpPath, filePath)
      } catch (err) {
        console.warn('[REWIND Capture] Snapshot write error:', err)
      }
    }

    return {
      id,
      timestamp: Date.now(),
      hwnd,
      width,
      height,
      phash,
      screenshotPath: filePath,
      isChanged,
      windowTitle: info?.title,
      processName: info?.processName,
      processPath: info?.processPath,
      pid: info?.pid,
      x: bounds.x,
      y: bounds.y,
    }
  }

  /**
   * Evaluates if two hashes exceed the perceptual difference threshold.
   */
  private isVisualDifference(prev: string, current: string): boolean {
    if (prev === current) return false
    let diff = 0
    for (let i = 0; i < 16; i++) {
      let xor = parseInt(prev[i], 16) ^ parseInt(current[i], 16)
      while (xor > 0) {
        diff += xor & 1
        xor >>= 1
      }
    }
    return diff > this.dhashThreshold
  }

  /**
   * Default Win32 driver implementation using Koffi when running on Windows.
   * On other platforms (or if Koffi cannot load) the driver reports "no
   * window", so nothing is captured and nothing fake is written.
   */
  private createDefaultNativeDriver(): NonNullable<CaptureEngineOptions['nativeDriver']> {
    const none: NonNullable<CaptureEngineOptions['nativeDriver']> = {
      getActiveWindowHandle: () => null,
      getWindowDimensions: () => ({ width: 0, height: 0, x: 0, y: 0 }),
      captureWindowPixels: () => null,
    }
    if (process.platform !== 'win32') return none

    try {
      const koffi = nodeRequire('koffi')
      const user32 = koffi.load('user32.dll')
      const gdi32 = koffi.load('gdi32.dll')
      const kernel32 = koffi.load('kernel32.dll')

      koffi.struct('RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' })
      koffi.struct('BITMAPINFOHEADER', {
        biSize: 'uint32',
        biWidth: 'int32',
        biHeight: 'int32',
        biPlanes: 'uint16',
        biBitCount: 'uint16',
        biCompression: 'uint32',
        biSizeImage: 'uint32',
        biXPelsPerMeter: 'int32',
        biYPelsPerMeter: 'int32',
        biClrUsed: 'uint32',
        biClrImportant: 'uint32',
      })

      const GetForegroundWindow = user32.func('GetForegroundWindow', 'intptr', [])
      const GetWindowRect = user32.func('GetWindowRect', 'bool', ['intptr', '_Out_ RECT*'])
      const GetWindowTextW = user32.func('GetWindowTextW', 'int', ['intptr', '_Out_ uint16*', 'int'])
      const GetWindowThreadProcessId = user32.func('GetWindowThreadProcessId', 'uint32', ['intptr', '_Out_ uint32*'])
      const GetDC = user32.func('GetDC', 'intptr', ['intptr'])
      const ReleaseDC = user32.func('ReleaseDC', 'int', ['intptr', 'intptr'])
      const PrintWindow = user32.func('PrintWindow', 'bool', ['intptr', 'intptr', 'uint32'])
      const CreateCompatibleDC = gdi32.func('CreateCompatibleDC', 'intptr', ['intptr'])
      const CreateCompatibleBitmap = gdi32.func('CreateCompatibleBitmap', 'intptr', ['intptr', 'int', 'int'])
      const SelectObject = gdi32.func('SelectObject', 'intptr', ['intptr', 'intptr'])
      const DeleteObject = gdi32.func('DeleteObject', 'bool', ['intptr'])
      const DeleteDC = gdi32.func('DeleteDC', 'bool', ['intptr'])
      const GetDIBits = gdi32.func('GetDIBits', 'int', [
        'intptr', 'intptr', 'uint32', 'uint32', 'void*', '_Inout_ BITMAPINFOHEADER*', 'uint32',
      ])
      const OpenProcess = kernel32.func('OpenProcess', 'intptr', ['uint32', 'bool', 'uint32'])
      const CloseHandle = kernel32.func('CloseHandle', 'bool', ['intptr'])
      const QueryFullProcessImageNameW = kernel32.func('QueryFullProcessImageNameW', 'bool', [
        'intptr', 'uint32', '_Out_ uint16*', '_Inout_ uint32*',
      ])

      const PW_RENDERFULLCONTENT = 0x00000002
      const DIB_RGB_COLORS = 0
      const BI_RGB = 0

      const wide = (buf: Uint16Array, len: number) =>
        Buffer.from(buf.buffer, buf.byteOffset, len * 2).toString('utf16le').replace(/\0+$/, '').trim()

      return {
        getActiveWindowHandle: () => {
          try {
            const hwnd = GetForegroundWindow()
            return hwnd ? hwnd : null
          } catch {
            return null
          }
        },

        getWindowDimensions: (hwnd) => {
          try {
            const rect = { left: 0, top: 0, right: 0, bottom: 0 }
            if (GetWindowRect(hwnd, rect)) {
              return {
                x: rect.left,
                y: rect.top,
                width: Math.max(0, rect.right - rect.left),
                height: Math.max(0, rect.bottom - rect.top),
              }
            }
          } catch {
            // fall through
          }
          return { width: 0, height: 0, x: 0, y: 0 }
        },

        getWindowInfo: (hwnd) => {
          let title = ''
          let processName = ''
          let processPath = ''
          let pid = 0
          try {
            const titleBuf = new Uint16Array(512)
            const n = GetWindowTextW(hwnd, titleBuf, titleBuf.length)
            title = wide(titleBuf, Math.max(0, n))
          } catch {
            // title stays empty
          }
          try {
            const pidBuf = [0]
            GetWindowThreadProcessId(hwnd, pidBuf)
            pid = pidBuf[0]
            const hProcess = pid ? OpenProcess(0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, false, pid) : 0
            if (hProcess) {
              try {
                const pathBuf = new Uint16Array(1024)
                const size = [pathBuf.length]
                if (QueryFullProcessImageNameW(hProcess, 0, pathBuf, size)) {
                  processPath = wide(pathBuf, size[0])
                  processName = path.win32.basename(processPath)
                }
              } finally {
                CloseHandle(hProcess)
              }
            }
          } catch {
            // processName stays empty
          }
          // If we could not identify the process we cannot vouch for the
          // window, so report a name the Ghost Shield will refuse.
          return { title, processName: processName || 'consent.exe', processPath: processPath || undefined, pid: pid || undefined }
        },

        captureWindowPixels: (hwnd, w, h) => {
          let screenDc = 0
          let memDc = 0
          let bitmap = 0
          try {
            screenDc = GetDC(0)
            if (!screenDc) return null
            memDc = CreateCompatibleDC(screenDc)
            bitmap = CreateCompatibleBitmap(screenDc, w, h)
            if (!memDc || !bitmap) return null
            const previous = SelectObject(memDc, bitmap)
            const printed = PrintWindow(hwnd, memDc, PW_RENDERFULLCONTENT)
            if (!printed) {
              SelectObject(memDc, previous)
              return null
            }

            // GetDIBits requires the bitmap NOT be selected into a DC.
            SelectObject(memDc, previous)
            const header = {
              biSize: 40,
              biWidth: w,
              biHeight: -h, // negative = top-down rows
              biPlanes: 1,
              biBitCount: 32,
              biCompression: BI_RGB,
              biSizeImage: w * h * 4,
              biXPelsPerMeter: 0,
              biYPelsPerMeter: 0,
              biClrUsed: 0,
              biClrImportant: 0,
            }
            const pixels = Buffer.alloc(w * h * 4)
            const lines = GetDIBits(memDc, bitmap, 0, h, pixels, header, DIB_RGB_COLORS)
            if (lines !== h) return null

            // GDI hands back BGRA; the rest of the pipeline expects RGBA.
            for (let i = 0; i < pixels.length; i += 4) {
              const b = pixels[i]
              pixels[i] = pixels[i + 2]
              pixels[i + 2] = b
              pixels[i + 3] = 255
            }
            return new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.length)
          } catch {
            return null
          } finally {
            try { if (bitmap) DeleteObject(bitmap) } catch { /* ignore */ }
            try { if (memDc) DeleteDC(memDc) } catch { /* ignore */ }
            try { if (screenDc) ReleaseDC(0, screenDc) } catch { /* ignore */ }
          }
        },
      }
    } catch {
      return none
    }
  }

  getLastPhash(): string {
    return this.lastPhash
  }

  getStorageDir(): string {
    return this.storageDir
  }
}
