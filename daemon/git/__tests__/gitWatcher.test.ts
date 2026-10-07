/**
 * Tests for REWIND Git Branch Context Watcher
 * Tests GitWatcher behavior via dependency injection for 100% test reliability.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { GitWatcher, type GitWatcherDeps } from '../gitWatcher.js'

describe('GitWatcher.getContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createMockDeps(branch = 'main', commitHash = 'abc1234567890def', dirty = 2): GitWatcherDeps {
    return {
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn((p: string) => {
        const filePath = String(p).replace(/\\/g, '/')
        if (filePath.endsWith('HEAD')) return `ref: refs/heads/${branch}\n`
        if (filePath.includes(`refs/heads/${branch}`)) return `${commitHash}\n`
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      }),
      execSync: vi.fn(() =>
        Array.from({ length: dirty }, (_, i) => ` M file${i}.ts`).join('\n') + '\n'
      ),
    }
  }

  it('reads branch name from .git/HEAD ref', () => {
    const deps = createMockDeps('feature-x')
    const watcher = new GitWatcher('/fake/repo', deps)
    const ctx = watcher.getContext()
    expect(ctx.branch).toBe('feature-x')
    expect(ctx.repoRoot).toBe('/fake/repo')
  })

  it('returns commit hash from ref file', () => {
    const deps = createMockDeps('main', 'deadbeef12345678deadbeef12345678deadbeef')
    const watcher = new GitWatcher('/fake/repo', deps)
    const ctx = watcher.getContext()
    expect(ctx.commitHash).toBe('deadbeef12345678deadbeef12345678deadbeef')
  })

  it('counts dirty files from git status --porcelain', () => {
    const deps = createMockDeps('main', 'abc1234', 5)
    const watcher = new GitWatcher('/fake/repo', deps)
    const ctx = watcher.getContext()
    expect(ctx.dirtyFileCount).toBe(5)
  })

  it('detects detached HEAD — uses first 8 chars of hash as branch', () => {
    const deps: GitWatcherDeps = {
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn((p: string) => {
        if (String(p).endsWith('HEAD')) return 'abcdef1234567890\n'
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      }),
      execSync: vi.fn(() => ''),
    }
    const watcher = new GitWatcher('/fake/repo', deps)
    const ctx = watcher.getContext()
    expect(ctx.branch).toBe('abcdef12')
  })

  it('returns default context when .git does not exist', () => {
    const deps: GitWatcherDeps = {
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(() => ''),
      execSync: vi.fn(() => ''),
    }
    const watcher = new GitWatcher('/no-git-here', deps)
    const ctx = watcher.getContext()
    expect(ctx.branch).toBe('unknown')
    expect(ctx.commitHash).toBe('0000000')
    expect(ctx.dirtyFileCount).toBe(0)
  })

  it('returns default context on unexpected error', () => {
    const deps: GitWatcherDeps = {
      existsSync: vi.fn(() => {
        throw new Error('Permission denied')
      }),
      readFileSync: vi.fn(() => ''),
      execSync: vi.fn(() => ''),
    }
    const watcher = new GitWatcher('/broken/path', deps)
    const ctx = watcher.getContext()
    expect(ctx.branch).toBe('unknown')
  })
})

describe('GitWatcher watch/stop lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls callback when branch changes during poll', () => {
    let currentBranch = 'main'
    const deps: GitWatcherDeps = {
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn((p: string) => {
        if (String(p).endsWith('HEAD')) return `ref: refs/heads/${currentBranch}\n`
        return 'hash123\n'
      }),
      execSync: vi.fn(() => ''),
    }

    const watcher = new GitWatcher('/fake/repo', deps)
    const callback = vi.fn()
    watcher.watchForChanges(callback, 1000)

    // Trigger branch change for next poll
    currentBranch = 'new-branch'

    vi.advanceTimersByTime(1100)
    expect(callback).toHaveBeenCalledOnce()
    expect(callback.mock.calls[0][0].branch).toBe('new-branch')
    watcher.stopWatching()
  })

  it('does not call callback when nothing changes', () => {
    const deps: GitWatcherDeps = {
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => 'ref: refs/heads/main\n'),
      execSync: vi.fn(() => ''),
    }

    const watcher = new GitWatcher('/fake/repo', deps)
    const callback = vi.fn()
    watcher.watchForChanges(callback, 1000)
    vi.advanceTimersByTime(3500)
    expect(callback).not.toHaveBeenCalled()
    watcher.stopWatching()
  })

  it('stopWatching prevents further callbacks', () => {
    let currentBranch = 'main'
    const deps: GitWatcherDeps = {
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(() => `ref: refs/heads/${currentBranch}\n`),
      execSync: vi.fn(() => ''),
    }

    const watcher = new GitWatcher('/fake/repo', deps)
    const callback = vi.fn()
    watcher.watchForChanges(callback, 1000)
    watcher.stopWatching()

    currentBranch = 'stopped'
    vi.advanceTimersByTime(5000)
    expect(callback).not.toHaveBeenCalled()
  })
})
