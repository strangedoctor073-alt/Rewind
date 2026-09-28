import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { BackupEngine } from '../backupEngine.js'

describe('desktop 20-second atomic WAL backup engine', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewind-test-'))
  })

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it('initializes backup paths cleanly in specified storage directory', () => {
    const engine = new BackupEngine(tempDir, 1000)
    expect(fs.existsSync(tempDir)).toBe(true)
    expect(engine.isDirty).toBe(false)
  })

  it('marks dirty when new session changes are registered', () => {
    const engine = new BackupEngine(tempDir, 1000)
    const mockSession = { id: 's-1', events: [{ id: 'e-1', title: 'Code edit' }] }

    engine.markDirty(mockSession)
    expect(engine.isDirty).toBe(true)
    expect(engine.currentSession).toBe(mockSession)
  })

  it('flushes changes atomically to .wal without leaving .tmp files', () => {
    const engine = new BackupEngine(tempDir, 1000)
    const mockSession = { id: 's-2', events: [{ id: 'e-2', kind: 'window-closed' }] }

    engine.markDirty(mockSession)
    const saved = engine.flushIfDirty()

    expect(saved).toBe(true)
    expect(engine.isDirty).toBe(false)

    const walFile = path.join(tempDir, 'rewind_session.wal')
    const tmpFile = path.join(tempDir, 'rewind_session.tmp')

    expect(fs.existsSync(walFile)).toBe(true)
    expect(fs.existsSync(tmpFile)).toBe(false) // Verified atomic rename

    const content = JSON.parse(fs.readFileSync(walFile, 'utf-8'))
    expect(content.id).toBe('s-2')
    expect(content.events.length).toBe(1)
  })

  it('skips flush when session is not dirty', () => {
    const engine = new BackupEngine(tempDir, 1000)
    const saved = engine.flushIfDirty()
    expect(saved).toBe(false)
  })

  it('restores the latest session after an unexpected crash or reboot', () => {
    const engine = new BackupEngine(tempDir, 1000)
    const mockSession = { id: 's-recovered', events: [{ id: 'e-rec', title: 'VS Code' }] }

    engine.markDirty(mockSession)
    engine.flushIfDirty()

    // Simulate new instance starting after crash
    const newEngine = new BackupEngine(tempDir, 1000)
    const restored = newEngine.restoreLatest()

    expect(restored).not.toBeNull()
    expect(restored?.id).toBe('s-recovered')
    expect(restored?.events[0].title).toBe('VS Code')
  })

  it('creates, lists, restores, and deletes checkpoints', () => {
    const engine = new BackupEngine(tempDir, 1000)
    const mockSession = {
      id: 's-checkpoint-test',
      events: [
        { id: 'e-1', title: 'Window 1' },
        { id: 'e-2', title: 'Window 2' },
      ],
    }

    const checkpoint = engine.createCheckpoint('Pre-Deployment Snapshot', mockSession)
    expect(checkpoint.id).toContain('chk-')
    expect(checkpoint.label).toBe('Pre-Deployment Snapshot')
    expect(checkpoint.eventCount).toBe(2)

    const list = engine.listCheckpoints()
    expect(list.length).toBe(1)
    expect(list[0].id).toBe(checkpoint.id)
    expect(list[0].label).toBe('Pre-Deployment Snapshot')

    const restored = engine.restoreCheckpoint(checkpoint.id)
    expect(restored).not.toBeNull()
    expect(restored?.id).toBe('s-checkpoint-test')
    expect(restored?.events.length).toBe(2)

    const deleted = engine.deleteCheckpoint(checkpoint.id)
    expect(deleted).toBe(true)
    expect(engine.listCheckpoints().length).toBe(0)
  })

  it('exports and imports backup bundle archives (.rewind.backup)', () => {
    const engine = new BackupEngine(tempDir, 1000)
    const mockSession = {
      id: 's-bundle-test',
      events: [{ id: 'e-b1', title: 'Exported Window' }],
    }
    engine.markDirty(mockSession)
    engine.createCheckpoint('Milestone 1', mockSession)

    const bundlePath = path.join(tempDir, 'export.rewind.backup')
    const exportResult = engine.exportBackupBundle(bundlePath)
    expect(exportResult.success).toBe(true)
    expect(fs.existsSync(bundlePath)).toBe(true)

    // Import into fresh storage directory
    const importDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rewind-import-'))
    const importEngine = new BackupEngine(importDir, 1000)
    const importResult = importEngine.importBackupBundle(bundlePath)

    expect(importResult.success).toBe(true)
    expect(importResult.importedCheckpoints).toBe(1)
    expect(importResult.restoredSession?.id).toBe('s-bundle-test')

    const importedCheckpoints = importEngine.listCheckpoints()
    expect(importedCheckpoints.length).toBe(1)
    expect(importedCheckpoints[0].label).toBe('Milestone 1')

    fs.rmSync(importDir, { recursive: true, force: true })
  })
})
