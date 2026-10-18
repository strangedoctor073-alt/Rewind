import { describe, it, expect } from 'vitest'
import { isWindowAllowed, sanitizeWindowTitle } from '../privacy.js'
// @ts-expect-error desktop/security.js is plain JavaScript with no type declarations
import { isWindowAllowed as desktopAllowed, sanitizeWindowTitle as desktopSanitize } from '../../desktop/security.js'

describe('daemon Ghost Shield', () => {
  it('blocks password managers and the UAC prompt by process name', () => {
    expect(isWindowAllowed('KeePassXC.exe', 'Database')).toBe(false)
    expect(isWindowAllowed('1Password.exe', '')).toBe(false)
    expect(isWindowAllowed('consent.exe', 'User Account Control')).toBe(false)
  })

  it('blocks private browsing and login windows by title', () => {
    expect(isWindowAllowed('chrome.exe', 'New Incognito Tab - Google Chrome')).toBe(false)
    expect(isWindowAllowed('msedge.exe', 'Sign in to your account')).toBe(false)
  })

  it('allows ordinary windows', () => {
    expect(isWindowAllowed('Code.exe', 'auth.ts - Rewind - Visual Studio Code')).toBe(true)
    expect(isWindowAllowed(undefined, undefined)).toBe(true)
  })

  it('redacts card-number-like digit runs in titles', () => {
    expect(sanitizeWindowTitle('Pay 4111 1111 1111 1111 now')).toBe('Pay [REDACTED_NUM] now')
  })

  it('agrees with desktop/security.js on a shared sample, so the two lists cannot silently drift', () => {
    const samples: Array<[string, string]> = [
      ['chrome.exe', 'Private Browsing - Firefox'],
      ['keepass.exe', 'Vault'],
      ['Code.exe', 'main.ts - Visual Studio Code'],
      ['chrome.exe', 'Sign in'],
      ['notepad.exe', 'notes.txt - Notepad'],
      ['chrome.exe', 'Master Password required'],
    ]
    for (const [proc, title] of samples) {
      expect(isWindowAllowed(proc, title)).toBe(desktopAllowed(proc, title))
    }
    expect(sanitizeWindowTitle('Card 4111111111111111')).toBe(desktopSanitize('Card 4111111111111111'))
  })
})
