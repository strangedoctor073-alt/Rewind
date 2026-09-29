import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createKeyProvider } from '../keyStore.js'
import { StateCaptureEngine, setStorageKeyProvider } from '../stateCapture.js'

// Fake "OS secure store": reversible wrapping so we can assert the key is not stored in the clear.
const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from(`wrapped:${Buffer.from(s).toString('hex')}`),
  decryptString: (b: Buffer) => {
    const text = b.toString()
    if (!text.startsWith('wrapped:')) throw new Error('bad blob')
    return Buffer.from(text.slice(8), 'hex').toString()
  },
}

describe('per-install encryption key store', () => {
  let dir: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewind-key-'))
  })
  afterEach(() => {
    setStorageKeyProvider(null)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('creates a random 32-byte key and persists it wrapped by the OS store', () => {
    const key = createKeyProvider({ safeStorage: fakeSafeStorage, dir })()
    expect(key).toHaveLength(32)
    const onDisk = fs.readFileSync(path.join(dir, 'rewind.key'))
    expect(onDisk.toString()).toContain('wrapped:')
    expect(onDisk.includes(key!)).toBe(false)
  })

  it('returns the same key on the next launch', () => {
    const first = createKeyProvider({ safeStorage: fakeSafeStorage, dir })()
    const second = createKeyProvider({ safeStorage: fakeSafeStorage, dir })()
    expect(second!.equals(first!)).toBe(true)
  })

  it('replaces a corrupt key file instead of crashing', () => {
    fs.writeFileSync(path.join(dir, 'rewind.key'), 'garbage')
    const key = createKeyProvider({ safeStorage: fakeSafeStorage, dir })()
    expect(key).toHaveLength(32)
  })

  it('returns null when OS secure storage is unavailable', () => {
    const provider = createKeyProvider({
      safeStorage: { ...fakeSafeStorage, isEncryptionAvailable: () => false },
      dir,
    })
    expect(provider()).toBeNull()
    expect(fs.existsSync(path.join(dir, 'rewind.key'))).toBe(false)
  })

  it('state blobs round-trip with the provider key and cannot be read with the fallback key', () => {
    setStorageKeyProvider(createKeyProvider({ safeStorage: fakeSafeStorage, dir }))
    const captured = StateCaptureEngine.captureState({
      processName: 'cmd.exe',
      exePath: 'C:\\Windows\\System32\\cmd.exe',
      title: 'cmd',
      cwd: 'C:\\Users\\demo',
      buffer: 'hello',
      history: ['dir'],
    })
    expect(StateCaptureEngine.decodeState(captured.encryptedBlob).cwd).toBe('C:\\Users\\demo')

    setStorageKeyProvider(null) // fallback (username-derived) key must NOT decrypt it
    expect(() => StateCaptureEngine.decodeState(captured.encryptedBlob)).toThrow()
  })
})
