/**
 * Phase 5.1: editor protocol adapter (VS Code family).
 *
 * A window title like `auth.ts - Rewind - Visual Studio Code` carries the file
 * name and workspace name but not an absolute path. We therefore look the file
 * up under the user's configured workspace roots and build a
 * `vscode://file/<abs_path>[:line[:col]]` URL (or `cursor://` /
 * `vscode-insiders://`). If the file cannot be found we fall back to opening
 * the workspace folder, and if even that is unknown the step is reported as
 * unresolved rather than guessed.
 *
 * JetBrains IDEs are not handled: their deep links need a project name and a
 * project-relative path that window titles do not reliably contain.
 */

import path from 'node:path'
import type { AdapterContext, FsLike, IEditorAdapter, MomentRecord, ResurrectStep } from '../types.js'
import { isSafeLaunchUrl, urlLaunch } from '../launcher.js'

export type EditorScheme = 'vscode' | 'vscode-insiders' | 'cursor'

export interface ParsedEditorTitle {
  scheme: EditorScheme | null
  fileName?: string
  workspace?: string
  /** True when the title carried the unsaved-changes dot. */
  dirty: boolean
}

const TITLE_SUFFIXES: Array<[RegExp, EditorScheme]> = [
  [/ - Visual Studio Code - Insiders$/i, 'vscode-insiders'],
  [/ - Visual Studio Code$/i, 'vscode'],
  [/ - Cursor$/i, 'cursor'],
]

const PROCESS_SCHEMES: Record<string, EditorScheme> = {
  'code.exe': 'vscode',
  'code - insiders.exe': 'vscode-insiders',
  'code-insiders.exe': 'vscode-insiders',
  'cursor.exe': 'cursor',
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.venv', 'venv', '__pycache__', '.next', '.cache'])

/** Parse an editor window title into file name / workspace name. */
export function parseEditorTitle(title: string): ParsedEditorTitle {
  let rest = (title ?? '').trim()
  let scheme: EditorScheme | null = null
  for (const [re, s] of TITLE_SUFFIXES) {
    if (re.test(rest)) {
      scheme = s
      rest = rest.replace(re, '')
      break
    }
  }

  const dirty = /^\u25CF/.test(rest)
  rest = rest.replace(/^[\u25CF\s]+/, '').trim()
  if (!rest) return { scheme, dirty }

  const cleanWorkspace = (name: string) =>
    name.replace(/\s*\[[^\]]+\]$/, '').replace(/\s*\(Workspace\)$/i, '').trim()

  const parts = rest.split(' - ')
  if (parts.length >= 2) {
    const workspace = cleanWorkspace(parts[parts.length - 1])
    const fileName = parts.slice(0, -1).join(' - ').trim()
    return { scheme, dirty, fileName: fileName || undefined, workspace: workspace || undefined }
  }

  // A lone part is either a file (has an extension) or just the workspace.
  if (/\.[A-Za-z0-9]{1,8}$/.test(rest)) return { scheme, dirty, fileName: rest }
  return { scheme, dirty, workspace: cleanWorkspace(rest) || undefined }
}

/** Editor URL for an absolute path, or null when the path is not absolute/safe. */
export function buildEditorUrl(scheme: EditorScheme, absPath: string, line?: number, column?: number): string | null {
  const normalized = absPath.replace(/\\/g, '/')
  if (normalized.startsWith('//')) return null // UNC paths: refuse
  const match = /^([A-Za-z]:)?(\/.*)$/.exec(normalized)
  if (!match) return null
  const [, drive, rest] = match
  const encoded = rest.split('/').map(encodeURIComponent).join('/')
  let url = `${scheme}://file${drive ? '/' + drive : ''}${encoded}`
  if (Number.isInteger(line) && (line as number) > 0) {
    url += `:${line}`
    if (Number.isInteger(column) && (column as number) > 0) url += `:${column}`
  }
  return isSafeLaunchUrl(url, [scheme]) ? url : null
}

function safeIsDir(fs: FsLike, p: string): boolean {
  try {
    return fs.statSync(p).isDirectory()
  } catch {
    return false
  }
}

/** Directories matching the workspace name: a root itself, or a child (up to 2 levels) of a root. */
export function findWorkspaceDirs(roots: string[], workspace: string | undefined, fs: FsLike): string[] {
  if (!workspace) return roots.filter((r) => safeIsDir(fs, r))
  const wanted = workspace.toLowerCase()
  const found: string[] = []
  for (const root of roots) {
    if (!safeIsDir(fs, root)) continue
    if (path.basename(root).toLowerCase() === wanted) {
      found.push(root)
      continue
    }
    try {
      for (const child of fs.readdirSync(root, { withFileTypes: true })) {
        if (!child.isDirectory() || SKIP_DIRS.has(child.name)) continue
        const childPath = path.join(root, child.name)
        if (child.name.toLowerCase() === wanted) {
          found.push(childPath)
          continue
        }
        for (const grand of fs.readdirSync(childPath, { withFileTypes: true })) {
          if (grand.isDirectory() && grand.name.toLowerCase() === wanted) found.push(path.join(childPath, grand.name))
        }
      }
    } catch {
      // unreadable directory: skip
    }
  }
  return found
}

/** Breadth-first, bounded search for `fileName`; returns the shallowest match. */
export function findFile(dirs: string[], fileName: string, fs: FsLike, maxVisited = 4000, maxDepth = 6): string | null {
  const wanted = fileName.toLowerCase()
  let visited = 0
  const queue: Array<{ dir: string; depth: number }> = dirs.map((dir) => ({ dir, depth: 0 }))
  while (queue.length > 0 && visited < maxVisited) {
    const { dir, depth } = queue.shift() as { dir: string; depth: number }
    let entries: ReturnType<FsLike['readdirSync']>
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      visited += 1
      if (entry.isFile() && entry.name.toLowerCase() === wanted) return path.join(dir, entry.name)
      if (entry.isDirectory() && depth < maxDepth && !SKIP_DIRS.has(entry.name)) {
        queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 })
      }
    }
  }
  return null
}

export class VsCodeAdapter implements IEditorAdapter {
  readonly id = 'vscode'

  canHandle(processName: string): boolean {
    return (processName ?? '').toLowerCase() in PROCESS_SCHEMES
  }

  plan(moment: MomentRecord, ctx: AdapterContext): ResurrectStep {
    const processName = path.win32.basename(moment.processPath ?? '') || moment.appName
    const parsed = parseEditorTitle(moment.windowTitle)
    const scheme = PROCESS_SCHEMES[processName.toLowerCase()] ?? parsed.scheme
    const label = `Editor: ${parsed.fileName ?? parsed.workspace ?? moment.windowTitle}`
    const base: ResurrectStep = {
      kind: 'editor',
      label,
      momentId: moment.id,
      bounds: moment.bounds,
      processName,
      titleHint: parsed.fileName ?? parsed.workspace,
      notes: parsed.dirty ? ['The file had unsaved changes when recorded; only the saved version can be reopened.'] : [],
    }

    if (!scheme) return { ...base, unresolved: 'Could not tell which editor this window belonged to.' }
    if (!parsed.fileName && !parsed.workspace) return { ...base, unresolved: 'The window title names no file or folder.' }

    const dirs = findWorkspaceDirs(ctx.workspaceRoots, parsed.workspace, ctx.fs)
    if (dirs.length === 0) {
      return {
        ...base,
        unresolved: parsed.workspace
          ? `No workspace folder named "${parsed.workspace}" was found under the configured workspace roots.`
          : 'No workspace roots are configured, so the file could not be located.',
      }
    }

    if (parsed.fileName) {
      const file = findFile(dirs, parsed.fileName, ctx.fs)
      const url = file ? buildEditorUrl(scheme, file) : null
      if (url) return { ...base, launch: urlLaunch(url) }
    }

    // File not found (or no file in the title): open the workspace folder itself.
    if (parsed.workspace) {
      const url = buildEditorUrl(scheme, dirs[0])
      if (url) {
        return {
          ...base,
          launch: urlLaunch(url),
          notes: [...(base.notes ?? []), parsed.fileName ? `"${parsed.fileName}" was not found; opening the folder instead.` : 'Opening the workspace folder.'],
        }
      }
    }
    return { ...base, unresolved: `"${parsed.fileName}" was not found under the workspace roots.` }
  }
}
