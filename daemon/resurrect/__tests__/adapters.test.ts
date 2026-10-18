import { describe, it, expect } from 'vitest'
import path from 'node:path'
import {
  VsCodeAdapter,
  buildEditorUrl,
  parseEditorTitle,
} from '../editors/vscodeAdapter.js'
import {
  TerminalAdapter,
  buildTerminalLaunch,
  detectShell,
  extractCwdFromTitle,
  isSafeCwd,
} from '../terminal/terminalAdapter.js'
import { planBrowserTabs, sanitizeTabUrl, BrowserReplayAdapter } from '../browser/browserReplayAdapter.js'
import { isSafeLaunchUrl, urlLaunch, createDefaultLauncher } from '../launcher.js'
import type { FsLike, MomentRecord } from '../types.js'
import type { DbBrowserEvent } from '../../db/timelineDb.js'

/** In-memory file system: a map of directory -> entries. */
function fakeFs(tree: Record<string, string[]>, files: Set<string> = new Set()): FsLike {
  const isDir = (p: string) => p in tree
  return {
    existsSync: (p) => isDir(p) || files.has(p),
    statSync: (p) => {
      if (!isDir(p) && !files.has(p)) throw new Error('ENOENT')
      return { isDirectory: () => isDir(p), isFile: () => files.has(p) }
    },
    readdirSync: (p) => {
      if (!isDir(p)) throw new Error('ENOENT')
      return tree[p].map((name) => {
        const full = path.join(p, name)
        return { name, isDirectory: () => isDir(full), isFile: () => files.has(full) }
      })
    },
  }
}

const moment = (over: Partial<MomentRecord>): MomentRecord => ({
  id: 'm-1',
  timestamp: 1_000_000,
  appName: 'Code.exe',
  windowTitle: '',
  isClosed: false,
  ...over,
})

describe('parseEditorTitle', () => {
  it('splits file, workspace and app suffix', () => {
    expect(parseEditorTitle('auth.ts - Rewind - Visual Studio Code')).toEqual({
      scheme: 'vscode', fileName: 'auth.ts', workspace: 'Rewind', dirty: false,
    })
  })
  it('notices the unsaved-changes dot and Insiders / Cursor suffixes', () => {
    expect(parseEditorTitle('\u25CF a.ts - proj - Visual Studio Code - Insiders')).toMatchObject({ scheme: 'vscode-insiders', dirty: true, fileName: 'a.ts' })
    expect(parseEditorTitle('b.py - proj - Cursor')).toMatchObject({ scheme: 'cursor', fileName: 'b.py' })
  })
  it('treats a lone extensionless part as a workspace and strips decorations', () => {
    expect(parseEditorTitle('Rewind (Workspace) - Visual Studio Code')).toMatchObject({ workspace: 'Rewind' })
    expect(parseEditorTitle('proj [Extension Development Host] - Visual Studio Code')).toMatchObject({ workspace: 'proj' })
    expect(parseEditorTitle('notes.md - Visual Studio Code')).toMatchObject({ fileName: 'notes.md' })
  })
})

describe('buildEditorUrl', () => {
  it('builds Windows and POSIX URLs with encoding and optional line/column', () => {
    expect(buildEditorUrl('vscode', 'C:\\dev\\my proj\\a.ts')).toBe('vscode://file/C:/dev/my%20proj/a.ts')
    expect(buildEditorUrl('cursor', '/home/u/a.ts', 12, 5)).toBe('cursor://file/home/u/a.ts:12:5')
  })
  it('refuses relative and UNC paths', () => {
    expect(buildEditorUrl('vscode', 'relative/a.ts')).toBeNull()
    expect(buildEditorUrl('vscode', '\\\\server\\share\\a.ts')).toBeNull()
  })
  it('percent-encodes characters that could break out of the argument', () => {
    const url = buildEditorUrl('vscode', 'C:\\dev\\a&b^c|d.ts') as string
    expect(url).toBe('vscode://file/C:/dev/a%26b%5Ec%7Cd.ts')
    expect(isSafeLaunchUrl(url, ['vscode'])).toBe(true)
  })
})

describe('VsCodeAdapter', () => {
  const root = path.join('/work', 'Rewind')
  const file = path.join(root, 'src', 'auth.ts')
  const fs = fakeFs({ '/work': ['Rewind'], [root]: ['src', 'node_modules'], [path.join(root, 'src')]: ['auth.ts'], [path.join(root, 'node_modules')]: ['auth.ts'] }, new Set([file, path.join(root, 'node_modules', 'auth.ts')]))
  const adapter = new VsCodeAdapter()

  it('recognises the VS Code family only', () => {
    expect(adapter.canHandle('Code.exe')).toBe(true)
    expect(adapter.canHandle('Cursor.exe')).toBe(true)
    expect(adapter.canHandle('chrome.exe')).toBe(false)
  })

  it('finds the file under a workspace root and ignores node_modules copies', () => {
    const step = adapter.plan(moment({ windowTitle: 'auth.ts - Rewind - Visual Studio Code' }), { workspaceRoots: ['/work'], fs })
    expect(step.unresolved).toBeUndefined()
    expect(step.launch?.command).toBe('rundll32.exe')
    expect(step.launch?.args[1]).toBe(buildEditorUrl('vscode', file))
  })

  it('falls back to opening the folder when the file is missing', () => {
    const step = adapter.plan(moment({ windowTitle: 'missing.ts - Rewind - Visual Studio Code' }), { workspaceRoots: ['/work'], fs })
    expect(step.launch?.args[1]).toBe(buildEditorUrl('vscode', root))
    expect(step.notes?.join(' ')).toContain('was not found')
  })

  it('reports unresolved instead of guessing when the workspace is unknown', () => {
    const step = adapter.plan(moment({ windowTitle: 'a.ts - Elsewhere - Visual Studio Code' }), { workspaceRoots: ['/work'], fs })
    expect(step.launch).toBeUndefined()
    expect(step.unresolved).toContain('Elsewhere')
  })

  it('warns that unsaved work cannot come back', () => {
    const step = adapter.plan(moment({ windowTitle: '\u25CF auth.ts - Rewind - Visual Studio Code' }), { workspaceRoots: ['/work'], fs })
    expect(step.notes?.join(' ')).toContain('unsaved')
  })
})

describe('terminal adapter', () => {
  it('detects shell flavour', () => {
    expect(detectShell('pwsh.exe', '')).toBe('pwsh')
    expect(detectShell('WindowsTerminal.exe', 'Windows PowerShell')).toBe('powershell')
    expect(detectShell('WindowsTerminal.exe', 'Command Prompt')).toBe('cmd')
    expect(detectShell('WindowsTerminal.exe', 'build')).toBe('default')
  })

  it('extracts a directory from a title', () => {
    expect(extractCwdFromTitle('Administrator: C:\\dev\\Rewind\\')).toBe('C:\\dev\\Rewind')
    expect(extractCwdFromTitle('Windows PowerShell')).toBeNull()
  })

  it('refuses paths that could inject a second wt command or shell syntax', () => {
    expect(isSafeCwd('C:\\dev\\ok dir')).toBe(true)
    expect(isSafeCwd('C:\\dev; new-tab cmd')).toBe(false) // ';' separates wt sub-commands
    expect(isSafeCwd('C:\\dev&calc')).toBe(false)
    expect(isSafeCwd('C:\\dev\\%USERPROFILE%')).toBe(false)
    expect(isSafeCwd('relative\\dir')).toBe(false)
    expect(buildTerminalLaunch('C:\\a;b', 'cmd')).toBeNull()
  })

  it('builds an argv-style wt.exe launch', () => {
    expect(buildTerminalLaunch('C:\\dev\\Rewind', 'pwsh')).toEqual({ command: 'wt.exe', args: ['-d', 'C:\\dev\\Rewind', 'pwsh.exe'] })
    expect(buildTerminalLaunch('C:\\dev\\Rewind', 'default')).toEqual({ command: 'wt.exe', args: ['-d', 'C:\\dev\\Rewind'] })
  })

  it('only plans a launch for a directory that still exists', () => {
    const adapter = new TerminalAdapter()
    const here = fakeFs({ 'C:\\dev\\Rewind': [] })
    const ok = adapter.plan(moment({ appName: 'pwsh.exe', windowTitle: 'C:\\dev\\Rewind' }), { workspaceRoots: [], fs: here })
    expect(ok.launch?.command).toBe('wt.exe')
    const gone = adapter.plan(moment({ appName: 'pwsh.exe', windowTitle: 'C:\\dev\\Deleted' }), { workspaceRoots: [], fs: here })
    expect(gone.unresolved).toContain('no longer exists')
    const none = adapter.plan(moment({ appName: 'pwsh.exe', windowTitle: 'Windows PowerShell' }), { workspaceRoots: [], fs: here })
    expect(none.unresolved).toContain('working directory')
  })
})

const ev = (over: Partial<DbBrowserEvent>): DbBrowserEvent => ({
  id: String(Math.random()),
  url: 'https://example.com/',
  eventKind: 'navigate',
  timestamp: 1000,
  ...over,
})

describe('browser replay', () => {
  it('sanitises URLs: http(s) only, credentials stripped', () => {
    expect(sanitizeTabUrl('https://u:p@example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(sanitizeTabUrl('javascript:alert(1)')).toBeNull()
    expect(sanitizeTabUrl('file:///C:/secret.txt')).toBeNull()
    expect(sanitizeTabUrl('not a url')).toBeNull()
  })

  it('keeps the latest event per tab inside the lookback window and orders oldest first', () => {
    const { tabs } = planBrowserTabs(
      [
        ev({ tabId: 1, url: 'https://a.test/old', timestamp: 100_000 }),
        ev({ tabId: 1, url: 'https://a.test/new', timestamp: 200_000, scrollY: 640 }),
        ev({ tabId: 2, url: 'https://b.test/', timestamp: 150_000 }),
        ev({ tabId: 3, url: 'https://c.test/ancient', timestamp: 1 }), // outside window
        ev({ tabId: 4, url: 'https://d.test/future', timestamp: 999_999 }), // after the moment
      ],
      300_000,
      { lookbackMs: 250_000 },
    )
    expect(tabs.map((t) => t.url)).toEqual(['https://b.test/', 'https://a.test/new'])
    expect(tabs[1].scrollY).toBe(640)
  })

  it('drops sensitive titles and non-web schemes, and caps the tab count', () => {
    const events = [
      ev({ tabId: 1, url: 'https://bank.test/', pageTitle: 'Sign in to your bank', timestamp: 10 }),
      ev({ tabId: 2, url: 'chrome://settings', timestamp: 11 }),
      ...Array.from({ length: 20 }, (_, i) => ev({ tabId: 100 + i, url: `https://t${i}.test/`, timestamp: 20 + i })),
    ]
    const { tabs, dropped } = planBrowserTabs(events, 1000, { maxTabs: 5 })
    expect(tabs).toHaveLength(5)
    expect(tabs[4].url).toBe('https://t19.test/') // newest kept
    expect(dropped).toBe(2 + 15)
  })

  it('adapter emits launch steps through the OS protocol handler', () => {
    const adapter = new BrowserReplayAdapter(() => [ev({ tabId: 1, url: 'https://a.test/x', timestamp: 5, pageTitle: 'A' })])
    const steps = adapter.plan(10)
    expect(steps).toHaveLength(1)
    expect(steps[0].launch).toEqual(urlLaunch('https://a.test/x'))
  })
})

describe('launcher', () => {
  it('rejects URLs with whitespace, quotes, carets or odd schemes', () => {
    expect(isSafeLaunchUrl('https://a.test/ok', ['https'])).toBe(true)
    expect(isSafeLaunchUrl('https://a.test/a b', ['https'])).toBe(false)
    expect(isSafeLaunchUrl('https://a.test/"x', ['https'])).toBe(false)
    expect(isSafeLaunchUrl('https://a.test/^x', ['https'])).toBe(false)
    expect(isSafeLaunchUrl('ftp://a.test/', ['https'])).toBe(false)
  })

  it('refuses to run on non-Windows platforms and refuses commands outside the allow-list', async () => {
    const linux = createDefaultLauncher('linux')
    expect((await linux({ command: 'wt.exe', args: [] })).ok).toBe(false)
    const win = createDefaultLauncher('win32', (() => { throw new Error('should not spawn') }) as never)
    const res = await win({ command: 'cmd.exe', args: ['/c', 'calc'] })
    expect(res.ok).toBe(false)
    expect(res.error).toContain('not an allowed command')
  })
})
