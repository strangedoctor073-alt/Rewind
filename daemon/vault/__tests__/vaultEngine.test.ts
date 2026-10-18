import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { VaultEngine } from '../vaultEngine.js'

describe('VaultEngine', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewind-vault-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('encrypts and decrypts memory buffers with perfect fidelity', () => {
    const original = Buffer.from('REWIND Timeline Database Binary Payload Mock Data 1234567890', 'utf-8')
    const pass = 'super-secure-vault-passphrase-2026'

    const encrypted = VaultEngine.encrypt(original, pass, { description: 'test backup' })
    expect(encrypted.length).toBeGreaterThan(0)
    expect(encrypted.subarray(0, 16).toString('utf-8')).toBe('REWIND_VAULT_V1\0')

    const decrypted = VaultEngine.decrypt(encrypted, pass)
    expect(decrypted.data.equals(original)).toBe(true)
    expect(decrypted.meta.description).toBe('test backup')
    expect(decrypted.meta.originalSize).toBe(original.length)
  })

  it('rejects decryption with incorrect passphrase', () => {
    const original = Buffer.from('Sensitive Timeline Data', 'utf-8')
    const encrypted = VaultEngine.encrypt(original, 'correct-passphrase')

    expect(() => {
      VaultEngine.decrypt(encrypted, 'wrong-passphrase')
    }).toThrow(/incorrect passphrase/i)
  })

  it('rejects tampered or corrupted vault data', () => {
    const original = Buffer.from('Sensitive Timeline Data', 'utf-8')
    const encrypted = VaultEngine.encrypt(original, 'correct-passphrase')

    // Tamper with bytes in ciphertext
    encrypted[encrypted.length - 5] ^= 0xff

    expect(() => {
      VaultEngine.decrypt(encrypted, 'correct-passphrase')
    }).toThrow(/corrupted|failed/i)
  })

  it('creates and restores vault files atomically on disk', () => {
    const srcFile = path.join(tmpDir, 'timeline.db')
    const vaultFile = path.join(tmpDir, 'backup.rewind-vault')
    const restoredFile = path.join(tmpDir, 'restored.db')

    const testData = 'Sample SQLite Database Contents for REWIND'
    fs.writeFileSync(srcFile, testData, 'utf-8')

    VaultEngine.createVaultFile(srcFile, vaultFile, 'my-vault-pass')
    expect(fs.existsSync(vaultFile)).toBe(true)

    VaultEngine.restoreVaultFile(vaultFile, restoredFile, 'my-vault-pass')
    expect(fs.existsSync(restoredFile)).toBe(true)

    const restoredContent = fs.readFileSync(restoredFile, 'utf-8')
    expect(restoredContent).toBe(testData)
  })
})
