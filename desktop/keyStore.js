/**
 * REWIND key store.
 * Generates one random 256-bit key per install and keeps it on disk wrapped by
 * Electron's safeStorage (DPAPI on Windows, Keychain on macOS, libsecret on Linux).
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

/**
 * @param {{ safeStorage: { isEncryptionAvailable(): boolean, encryptString(s: string): Buffer, decryptString(b: Buffer): string }, dir: string, fsImpl?: typeof fs }} opts
 * @returns {() => Buffer | null} returns null when OS-level protection is unavailable
 */
export function createKeyProvider({ safeStorage, dir, fsImpl = fs }) {
  const keyPath = path.join(dir, 'rewind.key')
  let cached = null

  return function getKey() {
    if (cached) return cached
    if (!safeStorage?.isEncryptionAvailable?.()) return null

    try {
      if (fsImpl.existsSync(keyPath)) {
        const key = Buffer.from(safeStorage.decryptString(fsImpl.readFileSync(keyPath)), 'base64')
        if (key.length === 32) {
          cached = key
          return cached
        }
      }
    } catch {
      // Unreadable or corrupt key file: fall through and mint a fresh key.
    }

    const key = crypto.randomBytes(32)
    fsImpl.mkdirSync(dir, { recursive: true })
    fsImpl.writeFileSync(keyPath, safeStorage.encryptString(key.toString('base64')), { mode: 0o600 })
    cached = key
    return cached
  }
}
