/**
 * Safe process launching for workspace resurrection.
 *
 * The roadmap sketch used `spawn('cmd.exe', ['/c', 'start', url])`. cmd.exe
 * re-parses its arguments, so a `&` or `^` inside a URL or path would run
 * arbitrary commands. Instead URLs go through `rundll32 url.dll,FileProtocolHandler`
 * (no shell parsing) and the launcher only ever starts executables from a
 * short allow-list with an argv array and `shell: false`.
 */

import { spawn, type SpawnOptions } from 'node:child_process'
import type { LaunchRequest, Launcher, LaunchOutcome } from './types.js'

/** Executables the default launcher is willing to start. */
export const ALLOWED_COMMANDS = new Set(['rundll32.exe', 'wt.exe'])

const MAX_URL_LENGTH = 2048
// Whitespace, control characters and characters that are special to the
// Windows command line / URL handlers.
// eslint-disable-next-line no-control-regex
const UNSAFE_URL_CHARS = /[\u0000-\u0020\u007f"<>^|`\\]/

/** True when `url` is a plain absolute URL with an allowed scheme and no dangerous characters. */
export function isSafeLaunchUrl(url: string, schemes: readonly string[]): boolean {
  if (typeof url !== 'string' || url.length === 0 || url.length > MAX_URL_LENGTH) return false
  if (UNSAFE_URL_CHARS.test(url)) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  return schemes.includes(parsed.protocol.replace(/:$/, ''))
}

/** Launch a URL (custom protocol or http/https) through the OS protocol handler, without a shell. */
export function urlLaunch(url: string): LaunchRequest {
  return { command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', url] }
}

type SpawnFn = (command: string, args: string[], options: SpawnOptions) => ReturnType<typeof spawn>

/**
 * Default launcher. Windows only: REWIND resurrects Windows desktop state.
 * `platform` and `spawnFn` are injectable so the behaviour is testable on Linux CI.
 */
export function createDefaultLauncher(
  platform: NodeJS.Platform = process.platform,
  spawnFn: SpawnFn = spawn,
): Launcher {
  return (request: LaunchRequest): Promise<LaunchOutcome> =>
    new Promise((resolve) => {
      if (platform !== 'win32') {
        resolve({ ok: false, error: `Workspace resurrection launches Windows apps; unsupported on ${platform}.` })
        return
      }
      if (!ALLOWED_COMMANDS.has(request.command.toLowerCase())) {
        resolve({ ok: false, error: `Refusing to launch "${request.command}": not an allowed command.` })
        return
      }
      try {
        const child = spawnFn(request.command, request.args, {
          shell: false,
          detached: true,
          stdio: 'ignore',
          windowsHide: false,
        })
        child.once('error', (err: Error) => {
          // Fall back to cmd.exe start when wt.exe is unavailable
          if (request.command.toLowerCase() === 'wt.exe') {
            try {
              const fallbackArgs = ['/c', 'start']
              const dIndex = request.args.indexOf('-d')
              if (dIndex !== -1 && request.args[dIndex + 1]) {
                fallbackArgs.push('/D', request.args[dIndex + 1])
              }
              const shellName = request.args.find((a) => a.endsWith('.exe')) || 'cmd.exe'
              fallbackArgs.push('""', shellName)
              const fallback = spawnFn('cmd.exe', fallbackArgs, {
                shell: false,
                detached: true,
                stdio: 'ignore',
                windowsHide: true,
              })
              fallback.once('spawn', () => {
                fallback.unref()
                resolve({ ok: true })
              })
              fallback.once('error', () => {
                resolve({ ok: false, error: err.message })
              })
              return
            } catch {
              // Fallback spawn failed; propagate original wt.exe launch failure
            }
          }
          resolve({ ok: false, error: err.message })
        })
        child.once('spawn', () => {
          child.unref()
          resolve({ ok: true })
        })
      } catch (err) {
        resolve({ ok: false, error: err instanceof Error ? err.message : 'Launch failed' })
      }
    })
}
