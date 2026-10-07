import { describe, expect, it } from 'vitest'
import { sanitizeNativeString } from '../win32.js'

describe('sanitizeNativeString', () => {
  it('returns a clean string unchanged (aside from trimming)', () => {
    expect(sanitizeNativeString('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')).toBe(
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    )
  })

  it('cuts everything from the first embedded NUL onward', () => {
    // Reproduces QueryFullProcessImageNameW reporting a written length larger
    // than what it actually wrote: the real path is followed by NUL padding
    // from the rest of the fixed-size native buffer.
    const padded = 'C:\\Windows\\System32\\notepad.exe' + '\0'.repeat(20)
    expect(sanitizeNativeString(padded)).toBe('C:\\Windows\\System32\\notepad.exe')
  })

  it('returns an empty string for empty or falsy input', () => {
    expect(sanitizeNativeString('')).toBe('')
    expect(sanitizeNativeString(undefined)).toBe('')
  })
})

describe('isWindowHung and getWindowTitle protection', () => {
  it('isWindowHung returns false when not initialized or null hwnd', async () => {
    const { isWindowHung } = await import('../win32.js')
    expect(isWindowHung(null)).toBe(false)
    expect(isWindowHung(0)).toBe(false)
  })

  it('getWindowTitle returns empty string when not initialized or null hwnd', async () => {
    const { getWindowTitle } = await import('../win32.js')
    expect(getWindowTitle(null)).toBe('')
  })
})
