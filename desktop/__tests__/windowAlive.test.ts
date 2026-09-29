import { describe, expect, it } from 'vitest'
import { _setWin32BindingsForTesting, isWindowAlive } from '../win32.js'

describe('isWindowAlive', () => {
  it('is false when Win32 bindings are not initialised', () => {
    _setWin32BindingsForTesting({ isInitialized: false })
    expect(isWindowAlive(1234)).toBe(false)
  })

  it('reflects IsWindow when bindings are available', () => {
    _setWin32BindingsForTesting({ isInitialized: true, IsWindow: (h: number) => h === 1 })
    expect(isWindowAlive(1)).toBe(true)
    expect(isWindowAlive(2)).toBe(false)
    expect(isWindowAlive(0)).toBe(false)
  })

  it('treats a throwing binding as not alive', () => {
    _setWin32BindingsForTesting({
      isInitialized: true,
      IsWindow: () => {
        throw new Error('boom')
      },
    })
    expect(isWindowAlive(1)).toBe(false)
    _setWin32BindingsForTesting({ isInitialized: false })
  })
})
