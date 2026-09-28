/**
 * REWIND Desktop Win32 Native API Bridge (via Koffi)
 * Provides high-speed, zero-compiler native access to Windows APIs:
 * - Active Window Title & Geometry tracking
 * - Process executable path resolution
 * - Synthetic Hotkey Dispatch (Ctrl+Z)
 * - Window Geometry Restoration
 */

import path from 'node:path'
import koffi from 'koffi'

let isInitialized = false
let user32 = null
let kernel32 = null

let GetForegroundWindow = null
let GetWindowTextW = null
let GetWindowTextLengthW = null
let GetWindowThreadProcessId = null
let GetWindowRect = null
let SetForegroundWindow = null
let SetWindowPos = null
let keybd_event = null
let OpenProcess = null
let QueryFullProcessImageNameW = null
let CloseHandle = null

const RectStruct = {
  left: 'long',
  top: 'long',
  right: 'long',
  bottom: 'long',
}

export function initWin32() {
  if (isInitialized) return true
  if (process.platform !== 'win32') return false

  try {
    user32 = koffi.load('user32.dll')
    kernel32 = koffi.load('kernel32.dll')

    GetForegroundWindow = user32.func('GetForegroundWindow', 'intptr', [])
    GetWindowTextW = user32.func('GetWindowTextW', 'int', ['intptr', '_Out_ uint16*', 'int'])
    GetWindowTextLengthW = user32.func('GetWindowTextLengthW', 'int', ['intptr'])
    GetWindowThreadProcessId = user32.func('GetWindowThreadProcessId', 'uint32', ['intptr', '_Out_ uint32*'])
    
    const RECT = koffi.struct('RECT', RectStruct)
    GetWindowRect = user32.func('GetWindowRect', 'bool', ['intptr', '_Out_ RECT*'])

    SetForegroundWindow = user32.func('SetForegroundWindow', 'bool', ['intptr'])
    SetWindowPos = user32.func('SetWindowPos', 'bool', [
      'intptr',
      'intptr',
      'int',
      'int',
      'int',
      'int',
      'uint32',
    ])
    keybd_event = user32.func('keybd_event', 'void', ['uint8', 'uint8', 'uint32', 'uintptr'])

    // PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    OpenProcess = kernel32.func('OpenProcess', 'intptr', ['uint32', 'bool', 'uint32'])
    QueryFullProcessImageNameW = kernel32.func('QueryFullProcessImageNameW', 'bool', [
      'intptr',
      'uint32',
      '_Out_ uint16*',
      '_Inout_ uint32*',
    ])
    CloseHandle = kernel32.func('CloseHandle', 'bool', ['intptr'])

    isInitialized = true
    return true
  } catch (err) {
    console.warn('[REWIND Win32] Koffi initialization warning:', err.message)
    return false
  }
}

/**
 * Reads the title of a window by HWND.
 */
export function getWindowTitle(hwnd) {
  if (!isInitialized || !hwnd) return ''
  try {
    const length = GetWindowTextLengthW(hwnd)
    if (length <= 0) return ''
    const buffer = new Uint16Array(length + 1)
    GetWindowTextW(hwnd, buffer, length + 1)
    return String.fromCharCode(...buffer.slice(0, length)).trim()
  } catch {
    return ''
  }
}

/**
 * Resolves the PID and executable path for an HWND.
 */
export function getWindowProcessInfo(hwnd) {
  if (!isInitialized || !hwnd) return { pid: 0, exePath: '', processName: 'unknown.exe' }
  try {
    const pidBuf = [0]
    GetWindowThreadProcessId(hwnd, pidBuf)
    const pid = pidBuf[0]
    if (!pid) return { pid: 0, exePath: '', processName: 'unknown.exe' }

    const hProcess = OpenProcess(0x1000, false, pid)
    let exePath = ''
    if (hProcess) {
      const pathBuf = new Uint16Array(1024)
      const sizeBuf = [1024]
      if (QueryFullProcessImageNameW(hProcess, 0, pathBuf, sizeBuf)) {
        exePath = String.fromCharCode(...pathBuf.slice(0, sizeBuf[0])).trim()
      }
      CloseHandle(hProcess)
    }

    const processName = exePath ? path.basename(exePath) : `pid_${pid}.exe`
    return { pid, exePath, processName }
  } catch {
    return { pid: 0, exePath: '', processName: 'unknown.exe' }
  }
}

/**
 * Gets window bounds.
 */
export function getWindowBounds(hwnd) {
  if (!isInitialized || !hwnd) return { x: 0, y: 0, width: 800, height: 600 }
  try {
    const rect = { left: 0, top: 0, right: 0, bottom: 0 }
    if (GetWindowRect(hwnd, rect)) {
      return {
        x: rect.left,
        y: rect.top,
        width: Math.max(100, rect.right - rect.left),
        height: Math.max(100, rect.bottom - rect.top),
      }
    }
  } catch {
    // fallback
  }
  return { x: 0, y: 0, width: 800, height: 600 }
}

/**
 * Returns complete metadata for the currently active foreground window.
 */
export function getActiveWindow() {
  if (!isInitialized) return null
  try {
    const hwnd = GetForegroundWindow()
    if (!hwnd) return null

    const title = getWindowTitle(hwnd)
    const { pid, exePath, processName } = getWindowProcessInfo(hwnd)
    const bounds = getWindowBounds(hwnd)

    return {
      hwnd,
      title,
      processName,
      exePath,
      pid,
      bounds,
    }
  } catch {
    return null
  }
}

/**
 * Synthesizes a Ctrl+Z keystroke dispatch to the target window.
 * Verifies that SetForegroundWindow succeeds and polls GetForegroundWindow
 * until focus has switched to the target (up to timeoutMs) before dispatching keys.
 * @param {number|bigint} hwnd - Target window handle
 * @param {number} [timeoutMs=500] - Maximum milliseconds to wait for focus switch
 * @returns {Promise<boolean>}
 */
export async function sendCtrlZ(hwnd, timeoutMs = 500) {
  if (!isInitialized) return false;
  try {
    // Attempt to bring the target window to foreground
    const setResult = SetForegroundWindow ? SetForegroundWindow(hwnd) : false;
    if (!setResult) {
      console.warn('[REWIND Win32] SetForegroundWindow failed for HWND', hwnd);
      return false;
    }

    // Wait until the foreground window matches the target (max timeoutMs)
    const stepMs = 50;
    const maxAttempts = Math.max(1, Math.ceil(timeoutMs / stepMs));
    let attempts = 0;
    while (attempts < maxAttempts) {
      const fg = GetForegroundWindow();
      if (fg === hwnd) break;
      await new Promise(r => setTimeout(r, stepMs));
      attempts++;
    }
    const finalFg = GetForegroundWindow();
    if (finalFg !== hwnd) {
      console.warn('[REWIND Win32] Foreground window did not switch to target after timeout');
      return false;
    }

    const VK_CONTROL = 0x11;
    const VK_Z = 0x5A;
    const KEYEVENTF_KEYUP = 0x0002;

    // Key Down: Ctrl + Z
    keybd_event(VK_CONTROL, 0, 0, 0);
    keybd_event(VK_Z, 0, 0, 0);

    // Key Up: Z + Ctrl
    keybd_event(VK_Z, 0, KEYEVENTF_KEYUP, 0);
    keybd_event(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0);

    return true;
  } catch (err) {
    console.error('[REWIND Win32] Failed to dispatch Ctrl+Z:', err);
    return false;
  }
}

/**
 * Testing helper to inject mock Win32 functions in non-Windows or isolated test environments.
 * @param {object} mocks
 */
export function _setWin32BindingsForTesting(mocks = {}) {
  if (mocks.GetForegroundWindow !== undefined) GetForegroundWindow = mocks.GetForegroundWindow;
  if (mocks.SetForegroundWindow !== undefined) SetForegroundWindow = mocks.SetForegroundWindow;
  if (mocks.keybd_event !== undefined) keybd_event = mocks.keybd_event;
  if (mocks.isInitialized !== undefined) isInitialized = mocks.isInitialized;
}

/**
 * Restores a window to its recorded screen coordinates.
 */
export function restoreWindowPosition(hwnd, bounds) {
  if (!isInitialized || !hwnd || !bounds) return false
  try {
    const SWP_NOZORDER = 0x0004
    const SWP_SHOWWINDOW = 0x0040
    return SetWindowPos(
      hwnd,
      0,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height,
      SWP_NOZORDER | SWP_SHOWWINDOW
    )
  } catch {
    return false
  }
}
