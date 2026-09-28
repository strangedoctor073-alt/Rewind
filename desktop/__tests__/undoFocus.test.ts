import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _setWin32BindingsForTesting, sendCtrlZ } from '../win32.js'
import { UndoEngine } from '../undoEngine.js'

describe('universal undo engine & win32 focus switch verification', () => {
  let mockGetForegroundWindow: ReturnType<typeof vi.fn>
  let mockSetForegroundWindow: ReturnType<typeof vi.fn>
  let mockKeybdEvent: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mockGetForegroundWindow = vi.fn()
    mockSetForegroundWindow = vi.fn()
    mockKeybdEvent = vi.fn()

    _setWin32BindingsForTesting({
      isInitialized: true,
      GetForegroundWindow: mockGetForegroundWindow,
      SetForegroundWindow: mockSetForegroundWindow,
      keybd_event: mockKeybdEvent,
    })
  })

  afterEach(() => {
    _setWin32BindingsForTesting({
      isInitialized: false,
    })
    vi.restoreAllMocks()
  })

  it('dispatches Ctrl+Z when window receives focus immediately', async () => {
    const targetHwnd = 12345
    mockSetForegroundWindow.mockReturnValue(true)
    mockGetForegroundWindow.mockReturnValue(targetHwnd)

    const result = await sendCtrlZ(targetHwnd, 500)

    expect(result).toBe(true)
    expect(mockSetForegroundWindow).toHaveBeenCalledWith(targetHwnd)
    expect(mockKeybdEvent).toHaveBeenCalledTimes(4) // Ctrl down, Z down, Z up, Ctrl up
  })

  it('returns false immediately when SetForegroundWindow fails', async () => {
    const targetHwnd = 54321
    mockSetForegroundWindow.mockReturnValue(false)

    const result = await sendCtrlZ(targetHwnd, 500)

    expect(result).toBe(false)
    expect(mockKeybdEvent).not.toHaveBeenCalled()
  })

  it('waits for delayed focus switch and succeeds within 500ms', async () => {
    const targetHwnd = 99999
    mockSetForegroundWindow.mockReturnValue(true)

    // Simulate focus switch taking ~100ms (2 ticks of 50ms)
    let callCount = 0
    mockGetForegroundWindow.mockImplementation(() => {
      callCount++
      return callCount >= 2 ? targetHwnd : 11111 // First call is still old window
    })

    const result = await sendCtrlZ(targetHwnd, 500)

    expect(result).toBe(true)
    expect(mockKeybdEvent).toHaveBeenCalled()
  })

  it('returns false when target window never gains focus within timeout', async () => {
    const targetHwnd = 88888
    mockSetForegroundWindow.mockReturnValue(true)
    mockGetForegroundWindow.mockReturnValue(11111) // Always remains on different window

    const result = await sendCtrlZ(targetHwnd, 120) // 120ms timeout

    expect(result).toBe(false)
    expect(mockKeybdEvent).not.toHaveBeenCalled() // Must NOT inject Ctrl+Z to wrong window
  })

  it('UndoEngine.undoActive delegates to sendCtrlZ with focus verification', async () => {
    const targetHwnd = 77777
    mockSetForegroundWindow.mockReturnValue(true)
    mockGetForegroundWindow.mockReturnValue(targetHwnd)

    const result = await UndoEngine.undoActive(targetHwnd, 500)

    expect(result).toBe(true)
    expect(mockSetForegroundWindow).toHaveBeenCalledWith(targetHwnd)
  })

  it('UndoEngine.undoActive returns false if no target window is available', async () => {
    // If no active window exists and no targetHwnd passed
    mockGetForegroundWindow.mockReturnValue(null)

    const result = await UndoEngine.undoActive(null)

    expect(result).toBe(false)
  })
})
