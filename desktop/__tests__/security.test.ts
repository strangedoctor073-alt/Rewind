import { describe, expect, it } from 'vitest'
import { isProcessAllowed, isWindowAllowed, isWindowTitleAllowed, sanitizeWindowTitle } from '../security.js'

describe('desktop security filter', () => {
  describe('isProcessAllowed', () => {
    it('blocks known password managers and credential vaults', () => {
      expect(isProcessAllowed('1password.exe')).toBe(false)
      expect(isProcessAllowed('Bitwarden.exe')).toBe(false)
      expect(isProcessAllowed('KeePass.exe')).toBe(false)
      expect(isProcessAllowed('keepassxc.exe')).toBe(false)
      expect(isProcessAllowed('credentialmanager.exe')).toBe(false)
      expect(isProcessAllowed('consent.exe')).toBe(false) // UAC
    })

    it('allows standard engineering and creative desktop applications', () => {
      expect(isProcessAllowed('code.exe')).toBe(true)
      expect(isProcessAllowed('chrome.exe')).toBe(true)
      expect(isProcessAllowed('notepad.exe')).toBe(true)
      expect(isProcessAllowed('figma.exe')).toBe(true)
      expect(isProcessAllowed('terminal.exe')).toBe(true)
    })
  })

  describe('isWindowTitleAllowed', () => {
    it('blocks windows containing private browsing or authentication keywords', () => {
      expect(isWindowTitleAllowed('GitHub - Google Chrome (Incognito)')).toBe(false)
      expect(isWindowTitleAllowed('Private Browsing - Mozilla Firefox')).toBe(false)
      expect(isWindowTitleAllowed('Bitwarden - Master Password')).toBe(false)
      expect(isWindowTitleAllowed('Windows Security - Enter PIN')).toBe(false)
    })

    it('allows normal working windows', () => {
      expect(isWindowTitleAllowed('App.tsx - REWIND - Visual Studio Code')).toBe(true)
      expect(isWindowTitleAllowed('Meeting Notes - Obsidian')).toBe(true)
      expect(isWindowTitleAllowed('YouTube - Brave')).toBe(true)
    })
  })

  describe('isWindowAllowed', () => {
    it('evaluates both process and title conjunction', () => {
      expect(isWindowAllowed('code.exe', 'index.ts - Code')).toBe(true)
      expect(isWindowAllowed('1password.exe', 'Vault')).toBe(false)
      expect(isWindowAllowed('chrome.exe', 'Sign in to your account')).toBe(false)
    })
  })

  describe('sanitizeWindowTitle', () => {
    it('redacts long credit card numbers from window titles', () => {
      const sensitiveTitle = 'Order #4421 - 4532 1122 3344 5566 Receipt'
      const sanitized = sanitizeWindowTitle(sensitiveTitle)
      expect(sanitized).not.toContain('4532 1122 3344 5566')
      expect(sanitized).toContain('[REDACTED_NUM]')
    })

    it('leaves standard titles intact', () => {
      expect(sanitizeWindowTitle('Design Sprint v2.0')).toBe('Design Sprint v2.0')
    })
  })
})
