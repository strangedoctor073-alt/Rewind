/**
 * Win32 implementation of WindowDriver using Koffi.
 *
 * Honesty note: written without access to a Windows machine, so it has not
 * been run against real windows. Every call is wrapped; on any failure the
 * driver reports "nothing found / could not move" rather than throwing, and on
 * non-Windows platforms `createWin32WindowDriver()` returns null.
 */

import path from 'node:path'
import { createRequire } from 'node:module'
import type { WindowBounds } from '../types.js'
import type { DesktopRect, WindowDriver, WindowInfo } from './windowGeometryRestorer.js'

const nodeRequire = createRequire(import.meta.url)

const SWP_NOZORDER = 0x0004
const SWP_NOACTIVATE = 0x0010
const SW_RESTORE = 9
const SM_XVIRTUALSCREEN = 76
const SM_YVIRTUALSCREEN = 77
const SM_CXVIRTUALSCREEN = 78
const SM_CYVIRTUALSCREEN = 79
const DPI_AWARENESS_PER_MONITOR_AWARE_V2 = -4

export function createWin32WindowDriver(): WindowDriver | null {
  if (process.platform !== 'win32') return null
  try {
    const koffi = nodeRequire('koffi')
    const user32 = koffi.load('user32.dll')
    const kernel32 = koffi.load('kernel32.dll')

    const WNDENUMPROC = koffi.proto('bool __stdcall WNDENUMPROC(intptr hwnd, intptr lParam)')
    const EnumWindows = user32.func('bool __stdcall EnumWindows(WNDENUMPROC *cb, intptr lParam)')
    const IsWindowVisible = user32.func('bool IsWindowVisible(intptr hwnd)')
    const IsIconic = user32.func('bool IsIconic(intptr hwnd)')
    const ShowWindow = user32.func('bool ShowWindow(intptr hwnd, int cmd)')
    const GetWindowTextW = user32.func('int GetWindowTextW(intptr hwnd, _Out_ uint16_t *buf, int max)')
    const GetWindowThreadProcessId = user32.func('uint32 GetWindowThreadProcessId(intptr hwnd, _Out_ uint32_t *pid)')
    const SetWindowPos = user32.func('bool SetWindowPos(intptr hwnd, intptr after, int x, int y, int cx, int cy, uint32 flags)')
    const GetSystemMetrics = user32.func('int GetSystemMetrics(int index)')
    const OpenProcess = kernel32.func('intptr OpenProcess(uint32 access, bool inherit, uint32 pid)')
    const CloseHandle = kernel32.func('bool CloseHandle(intptr h)')
    const QueryFullProcessImageNameW = kernel32.func(
      'bool QueryFullProcessImageNameW(intptr h, uint32 flags, _Out_ uint16_t *buf, _Inout_ uint32_t *size)',
    )

    // Switch to physical-pixel coordinates (see file header in windowGeometryRestorer.ts).
    try {
      user32.func('bool SetProcessDpiAwarenessContext(intptr ctx)')(DPI_AWARENESS_PER_MONITOR_AWARE_V2)
    } catch {
      // Already set, or older Windows: continue.
    }

    const utf16 = (buf: Uint16Array, len: number) =>
      Buffer.from(buf.buffer, buf.byteOffset, len * 2).toString('utf16le').replace(/\0+$/, '').trim()

    const processNameFor = (pid: number): string => {
      const handle = OpenProcess(0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, false, pid)
      if (!handle) return ''
      try {
        const buf = new Uint16Array(1024)
        const size = [buf.length]
        return QueryFullProcessImageNameW(handle, 0, buf, size) ? path.win32.basename(utf16(buf, size[0])) : ''
      } finally {
        CloseHandle(handle)
      }
    }

    return {
      listWindows(): WindowInfo[] {
        const found: WindowInfo[] = []
        const callback = koffi.register((hwnd: number) => {
          try {
            if (!IsWindowVisible(hwnd)) return true
            const titleBuf = new Uint16Array(512)
            const n = GetWindowTextW(hwnd, titleBuf, titleBuf.length)
            if (n <= 0) return true
            const pidOut = [0]
            GetWindowThreadProcessId(hwnd, pidOut)
            const pid = pidOut[0]
            found.push({ hwnd, pid, processName: processNameFor(pid), title: utf16(titleBuf, n) })
          } catch {
            // skip windows we cannot inspect
          }
          return true
        }, koffi.pointer(WNDENUMPROC))
        try {
          EnumWindows(callback, 0)
        } catch {
          // return whatever was collected
        } finally {
          koffi.unregister(callback)
        }
        return found
      },

      setBounds(hwnd: number | bigint, bounds: WindowBounds): boolean {
        try {
          if (IsIconic(hwnd)) ShowWindow(hwnd, SW_RESTORE)
          return Boolean(SetWindowPos(hwnd, 0, bounds.x, bounds.y, bounds.width, bounds.height, SWP_NOZORDER | SWP_NOACTIVATE))
        } catch {
          return false
        }
      },

      getDesktopRect(): DesktopRect {
        try {
          const left = GetSystemMetrics(SM_XVIRTUALSCREEN)
          const top = GetSystemMetrics(SM_YVIRTUALSCREEN)
          return { left, top, right: left + GetSystemMetrics(SM_CXVIRTUALSCREEN), bottom: top + GetSystemMetrics(SM_CYVIRTUALSCREEN) }
        } catch {
          return { left: 0, top: 0, right: 0, bottom: 0 }
        }
      },
    }
  } catch {
    return null
  }
}
