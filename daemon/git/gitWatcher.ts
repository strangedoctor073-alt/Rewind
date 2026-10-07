/**
 * REWIND Git Branch Context Watcher
 * Reads .git/HEAD and refs to provide real-time branch context
 * for timeline moment tagging and provenance export.
 */

import { existsSync as defaultExistsSync, readFileSync as defaultReadFileSync } from 'node:fs'
import path from 'node:path'
import { execSync as defaultExecSync } from 'node:child_process'

export interface GitContext {
  branch: string
  commitHash: string
  dirtyFileCount: number
  repoRoot: string
}

export interface GitWatcherDeps {
  existsSync?: (path: string) => boolean
  readFileSync?: (path: string, encoding: 'utf-8') => string
  execSync?: (cmd: string, options: unknown) => string | Buffer
}

const DEFAULT_CONTEXT: Readonly<GitContext> = Object.freeze({
  branch: 'unknown',
  commitHash: '0000000',
  dirtyFileCount: 0,
  repoRoot: '.',
})

export class GitWatcher {
  private readonly repoRoot: string
  private intervalHandle: ReturnType<typeof setInterval> | null = null
  private lastBranch = ''
  private lastHash = ''
  private readonly existsSync: (path: string) => boolean
  private readonly readFileSync: (path: string, encoding: 'utf-8') => string
  private readonly execSync: (cmd: string, options: unknown) => string | Buffer

  constructor(repoRoot: string = process.cwd(), deps?: GitWatcherDeps) {
    // Trap 1: sanitize native paths
    this.repoRoot = repoRoot.replace(/\0+$/, '').trim()
    this.existsSync = deps?.existsSync ?? defaultExistsSync
    this.readFileSync = deps?.readFileSync ?? defaultReadFileSync
    this.execSync = deps?.execSync ?? defaultExecSync
  }

  /** Synchronously read current git context from the filesystem. */
  getContext(): GitContext {
    try {
      const gitDir = path.join(this.repoRoot, '.git')
      if (!this.existsSync(gitDir)) return { ...DEFAULT_CONTEXT, repoRoot: this.repoRoot }

      const branch = this.readBranch(gitDir)
      const commitHash = this.readCommitHash(gitDir, branch)
      const dirtyFileCount = this.countDirtyFiles()

      return { branch, commitHash, dirtyFileCount, repoRoot: this.repoRoot }
    } catch {
      return { ...DEFAULT_CONTEXT, repoRoot: this.repoRoot }
    }
  }

  /** Start polling for branch/commit changes. */
  watchForChanges(callback: (ctx: GitContext) => void, intervalMs = 5000): void {
    this.stopWatching()
    const ctx = this.getContext()
    this.lastBranch = ctx.branch
    this.lastHash = ctx.commitHash

    this.intervalHandle = setInterval(() => {
      const current = this.getContext()
      if (current.branch !== this.lastBranch || current.commitHash !== this.lastHash) {
        this.lastBranch = current.branch
        this.lastHash = current.commitHash
        callback(current)
      }
    }, intervalMs)
  }

  /** Stop the polling interval. */
  stopWatching(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
    }
  }

  /** Read current branch from .git/HEAD */
  private readBranch(gitDir: string): string {
    const headPath = path.join(gitDir, 'HEAD')
    const headContent = this.readFileSync(headPath, 'utf-8').trim()

    if (headContent.startsWith('ref: refs/heads/')) {
      return headContent.slice('ref: refs/heads/'.length)
    }

    // Detached HEAD — return first 8 chars of the hash
    return headContent.slice(0, 8)
  }

  /** Resolve commit hash from ref file or packed-refs. */
  private readCommitHash(gitDir: string, branch: string): string {
    // Try direct ref file first
    const refPath = path.join(gitDir, 'refs', 'heads', branch)
    try {
      return this.readFileSync(refPath, 'utf-8').trim().slice(0, 40)
    } catch {
      // fallthrough to packed-refs
    }

    // Try packed-refs
    const packedPath = path.join(gitDir, 'packed-refs')
    try {
      const packed = this.readFileSync(packedPath, 'utf-8')
      const refLine = packed.split('\n').find((line) => line.endsWith(`refs/heads/${branch}`))
      if (refLine) {
        return refLine.split(' ')[0].trim().slice(0, 40)
      }
    } catch {
      // no packed-refs
    }

    // HEAD itself might contain the hash (detached)
    const headPath = path.join(gitDir, 'HEAD')
    try {
      const head = this.readFileSync(headPath, 'utf-8').trim()
      if (!head.startsWith('ref:')) return head.slice(0, 40)
    } catch {
      // fallthrough
    }

    return '0000000'
  }

  /** Count dirty files via `git status --porcelain`. */
  private countDirtyFiles(): number {
    try {
      const output = String(
        this.execSync('git status --porcelain', {
          cwd: this.repoRoot,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 5000,
        })
      )
      return output.split('\n').filter((line) => line.trim().length > 0).length
    } catch {
      return 0
    }
  }
}
