import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UndoEngine } from '../undoEngine.js'

describe('multi-tier restoreMoment engine', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('resurrects closed applications via resurrectWindow', async () => {
    const mockResurrect = vi.spyOn(UndoEngine, 'resurrectWindow').mockResolvedValue(true)

    const event = {
      id: 'evt-1',
      kind: 'window-closed',
      processName: 'notepad.exe',
      exePath: 'C:\\Windows\\notepad.exe',
      bounds: { x: 100, y: 100, width: 800, height: 600 },
    }

    const result = await UndoEngine.restoreMoment(event)

    expect(result.success).toBe(true)
    expect(result.action).toBe('resurrected')
    expect(mockResurrect).toHaveBeenCalledWith(event.exePath, event.bounds)
  })

  it('returns graceful failure when event is empty or invalid', async () => {
    const result = await UndoEngine.restoreMoment(null)
    expect(result.success).toBe(false)
    expect(result.action).toBe('none')
  })
})
