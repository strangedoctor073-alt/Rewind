/**
 * @vitest-environment node
 * Tests that import the real CLI module (the older rewind.test.ts only exercises mocks).
 */
import { describe, it, expect } from 'vitest'
import path from 'node:path'
// @ts-expect-error bin/rewind.js is plain JavaScript with no type declarations
import { parseResurrectArgs, daemonEntryPath, cmdMacro, cmdVault } from '../rewind.js'

describe('CLI helpers', () => {
  it('importing the module does not run the CLI', () => {
    expect(typeof parseResurrectArgs).toBe('function')
    expect(typeof cmdMacro).toBe('function')
    expect(typeof cmdVault).toBe('function')
  })

  it('parses resurrect arguments in either order', () => {
    expect(parseResurrectArgs(['m-123', '--dry-run'])).toEqual({ momentId: 'm-123', dryRun: true })
    expect(parseResurrectArgs(['--dry-run', 'm-123'])).toEqual({ momentId: 'm-123', dryRun: true })
    expect(parseResurrectArgs(['m-123'])).toEqual({ momentId: 'm-123', dryRun: false })
    expect(parseResurrectArgs([])).toEqual({ momentId: undefined, dryRun: false })
  })

  it('points start at the compiled daemon, not a .ts file that needs tsx', () => {
    const entry = daemonEntryPath()
    expect(entry.endsWith(path.join('dist-daemon', 'daemon', 'main.js'))).toBe(true)
  })
})
