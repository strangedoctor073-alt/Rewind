/**
 * REWIND RPC Auth Token Manager
 * Generates, persists, and validates 256-bit hex auth tokens
 * for daemon ↔ client authentication.
 */

import { randomBytes, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

/** Default token file location: %LOCALAPPDATA%\Rewind\auth.token */
function defaultTokenPath(): string {
  const base = process.env.LOCALAPPDATA || path.join(process.env.HOME || process.env.USERPROFILE || '.', 'AppData', 'Local')
  return path.join(base, 'Rewind', 'auth.token')
}

/** Generate a cryptographically secure 256-bit hex token. */
export function generateAuthToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Atomically write the auth token to disk.
 * Follows Trap 6: write to .tmp first, then rename.
 * On Windows, applies NTFS ACLs via icacls so only the current user has access.
 */
export function writeAuthToken(token: string, tokenPath?: string): void {
  const filePath = tokenPath || defaultTokenPath()
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })

  // 0o600: owner read/write only (POSIX).
  const tmpPath = filePath + '.tmp'
  fs.writeFileSync(tmpPath, token, { encoding: 'utf-8', mode: 0o600 })
  fs.renameSync(tmpPath, filePath)

  // On Windows, node's mode only controls the read-only flag.
  // Use icacls to strip inheritance and grant explicit (R,W) only to the current user.
  if (process.platform === 'win32') {
    try {
      const username = process.env.USERNAME
      if (username) {
        execFileSync('icacls.exe', [filePath, '/inheritance:r', '/grant:r', `${username}:(R,W)`], {
          windowsHide: true,
          stdio: 'ignore',
          timeout: 2000,
        })
      }
    } catch {
      // Best-effort: %LOCALAPPDATA% directory default ACL already restricts other non-admin users.
    }
  }
}

/** Read the auth token from disk. Returns null if file does not exist. */
export function readAuthToken(tokenPath?: string): string | null {
  const filePath = tokenPath || defaultTokenPath()
  try {
    return fs.readFileSync(filePath, 'utf-8').trim()
  } catch {
    return null
  }
}

/**
 * Constant-time token comparison to prevent timing attacks.
 * Returns false if lengths differ (no timing leak on length mismatch).
 */
export function validateToken(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, 'utf-8')
  const b = Buffer.from(expected, 'utf-8')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
