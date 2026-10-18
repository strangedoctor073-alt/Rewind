/**
 * Phase 5.2: terminal shell resurrection.
 *
 * The daemon does not record terminal scrollback or command history (it never
 * hooks the keyboard), so the only thing we can honestly bring back is "a
 * terminal of the same flavour in the same directory". The directory comes
 * from the window title when it is an existing absolute directory path.
 *
 * Launch: `wt.exe -d <cwd> <shell>` as an argv array, no shell involved.
 * `;` is Windows Terminal's own command separator, so a path containing one
 * could smuggle a second wt sub-command; such paths are refused outright.
 */

import path from 'node:path'
import type { AdapterContext, LaunchRequest, MomentRecord, ResurrectStep } from '../types.js'

export type ShellFlavor = 'pwsh' | 'powershell' | 'cmd' | 'bash' | 'wsl' | 'default'

const TERMINAL_PROCESSES = new Set([
  'windowsterminal.exe', 'wt.exe', 'pwsh.exe', 'powershell.exe', 'cmd.exe', 'bash.exe', 'wsl.exe', 'conhost.exe',
])

const SHELL_EXECUTABLES: Record<Exclude<ShellFlavor, 'default'>, string> = {
  pwsh: 'pwsh.exe',
  powershell: 'powershell.exe',
  cmd: 'cmd.exe',
  bash: 'bash.exe',
  wsl: 'wsl.exe',
}

// Letters, digits, space and a conservative set of punctuation. Excludes
// ; " % ^ & | < > ` $ and all control characters.
const SAFE_PATH = /^[A-Za-z0-9 _\-.()[\]{},'~+=@#!:\\/]+$/

export function isTerminalProcess(processName: string): boolean {
  return TERMINAL_PROCESSES.has((processName ?? '').toLowerCase())
}

export function detectShell(processName: string, title: string): ShellFlavor {
  const proc = (processName ?? '').toLowerCase()
  if (proc === 'pwsh.exe') return 'pwsh'
  if (proc === 'powershell.exe') return 'powershell'
  if (proc === 'cmd.exe') return 'cmd'
  if (proc === 'bash.exe') return 'bash'
  if (proc === 'wsl.exe') return 'wsl'
  const t = (title ?? '').toLowerCase()
  if (t.includes('pwsh') || t.includes('powershell 7')) return 'pwsh'
  if (t.includes('powershell')) return 'powershell'
  if (t.includes('command prompt') || t.includes('cmd.exe')) return 'cmd'
  if (t.includes('wsl') || t.includes('ubuntu')) return 'wsl'
  return 'default'
}

/** True when a path is safe to hand to wt.exe as a single argv element. */
export function isSafeCwd(p: string): boolean {
  if (typeof p !== 'string' || p.length === 0 || p.length > 260) return false
  if (!SAFE_PATH.test(p)) return false
  return /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('/')
}

/** Pull a candidate working directory out of a terminal window title. */
export function extractCwdFromTitle(title: string): string | null {
  let t = (title ?? '').trim()
  t = t.replace(/^(Administrator|Select Administrator):\s*/i, '').replace(/^["']|["']$/g, '').trim()
  if (/^[A-Za-z]:[\\/]/.test(t) || t.startsWith('/')) return t.replace(/[\\/]+$/, '') || null
  return null
}

export function buildTerminalLaunch(cwd: string, shell: ShellFlavor): LaunchRequest | null {
  if (!isSafeCwd(cwd)) return null
  const args = ['-d', cwd.replace(/[\\/]+$/, '')]
  if (shell !== 'default') args.push(SHELL_EXECUTABLES[shell])
  return { command: 'wt.exe', args }
}

export class TerminalAdapter {
  readonly id = 'terminal'

  canHandle(processName: string): boolean {
    return isTerminalProcess(processName)
  }

  plan(moment: MomentRecord, ctx: AdapterContext): ResurrectStep {
    const processName = path.win32.basename(moment.processPath ?? '') || moment.appName
    const shell = detectShell(processName, moment.windowTitle)
    const base: ResurrectStep = {
      kind: 'terminal',
      label: `Terminal (${shell}): ${moment.windowTitle || processName}`,
      momentId: moment.id,
      bounds: moment.bounds,
      processName: 'WindowsTerminal.exe',
      notes: ['Scrollback and command history are not recorded, so only the shell and directory come back.'],
    }

    const cwd = extractCwdFromTitle(moment.windowTitle)
    if (!cwd) return { ...base, unresolved: 'The window title does not show a working directory.' }
    if (!isSafeCwd(cwd)) return { ...base, unresolved: 'The directory path contains characters that are unsafe to pass to a terminal.' }

    let isDir: boolean
    try {
      isDir = ctx.fs.statSync(cwd).isDirectory()
    } catch {
      isDir = false
    }
    if (!isDir) return { ...base, unresolved: `"${cwd}" no longer exists.` }

    const launch = buildTerminalLaunch(cwd, shell)
    return launch ? { ...base, launch } : { ...base, unresolved: 'Could not build a safe terminal launch command.' }
  }
}
