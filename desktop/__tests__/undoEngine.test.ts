import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import { EventEmitter } from 'node:events'
import { UndoEngine, _setSpawnForTesting } from '../undoEngine.js'

function fakeChild(pid = 4242) {
  const child = new EventEmitter()
  child.pid = pid
  child.unref = () => {}
  return child
}

describe('UndoEngine.resurrectWindow', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    _setSpawnForTesting(null) // restore the real spawn between tests
  })

  it('launches the exact path directly when it exists on disk', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    const spawnSpy = vi.fn().mockReturnValue(fakeChild())
    _setSpawnForTesting(spawnSpy)

    const ok = await UndoEngine.resurrectWindow('C:\\Windows\\notepad.exe', null, 'notepad.exe')

    expect(ok).toBe(true)
    expect(spawnSpy).toHaveBeenCalledWith('C:\\Windows\\notepad.exe', [], expect.any(Object))
  })

  it('strips NUL padding from the captured path before checking it exists', async () => {
    const existsSpy = vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    _setSpawnForTesting(vi.fn().mockReturnValue(fakeChild()))

    await UndoEngine.resurrectWindow('C:\\Windows\\notepad.exe' + '\0'.repeat(10), null, 'notepad.exe')

    expect(existsSpy).toHaveBeenCalledWith('C:\\Windows\\notepad.exe')
  })

  it('falls back to a Windows App-Paths launch when the captured path is missing', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    const spawnSpy = vi.fn().mockReturnValue(fakeChild())
    _setSpawnForTesting(spawnSpy)

    const ok = await UndoEngine.resurrectWindow('', null, 'chrome.exe')

    expect(ok).toBe(true)
    expect(spawnSpy).toHaveBeenCalledWith(
      'cmd.exe',
      ['/c', 'start', '""', 'chrome.exe'],
      expect.objectContaining({ windowsHide: true }),
    )
  })

  it('fails cleanly when the path is missing and there is no process name to fall back to', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false)
    const spawnSpy = vi.fn()
    _setSpawnForTesting(spawnSpy)

    const ok = await UndoEngine.resurrectWindow('', null, '')

    expect(ok).toBe(false)
    expect(spawnSpy).not.toHaveBeenCalled()
  })

  it('returns false if spawn throws', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    _setSpawnForTesting(() => {
      throw new Error('spawn failed')
    })

    const ok = await UndoEngine.resurrectWindow('C:\\Windows\\notepad.exe', null, 'notepad.exe')
    expect(ok).toBe(false)
  })
})
