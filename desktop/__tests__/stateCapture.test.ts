import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  StateCaptureEngine,
  TERMINAL_DISCLAIMER,
  MAX_STATE_SIZE_BYTES,
  encryptPayload,
  decryptPayload,
  _setSpawnForTesting,
} from '../stateCapture.js'

describe('StateCaptureEngine', () => {
  afterEach(() => {
    _setSpawnForTesting(null)
    vi.restoreAllMocks()
  })

  it('identifies terminal and shell processes correctly', () => {
    expect(StateCaptureEngine.isTerminal('cmd.exe')).toBe(true)
    expect(StateCaptureEngine.isTerminal('powershell.exe')).toBe(true)
    expect(StateCaptureEngine.isTerminal('pwsh.exe')).toBe(true)
    expect(StateCaptureEngine.isTerminal('notepad.exe')).toBe(false)
    expect(StateCaptureEngine.isTerminal('')).toBe(false)
  })

  it('encrypts and decrypts payload buffer with AES-256-GCM', () => {
    const original = Buffer.from('REWIND secure state buffer payload', 'utf8')
    const encrypted = encryptPayload(original)
    expect(encrypted).not.toEqual(original)
    expect(encrypted.length).toBeGreaterThan(original.length)

    const decrypted = decryptPayload(encrypted)
    expect(decrypted.toString('utf8')).toBe('REWIND secure state buffer payload')
  })

  it('captures, compresses, and encrypts terminal state within 5 MiB cap', () => {
    const info = {
      processName: 'cmd.exe',
      exePath: 'C:\\Windows\\System32\\cmd.exe',
      title: 'Administrator: Command Prompt',
      cwd: 'C:\\Projects\\REWIND',
      buffer: 'C:\\Projects\\REWIND> npm test\n[PASS] All tests passed',
      history: ['cd REWIND', 'npm test'],
    }

    const result = StateCaptureEngine.captureState(info)
    expect(result.appType).toBe('terminal')
    expect(result.rawSize).toBeGreaterThan(0)
    expect(result.compressedSize).toBeLessThan(result.rawSize)
    expect(result.encryptedBlob).toBeInstanceOf(Buffer)

    // Verify round-trip decode
    const decoded = StateCaptureEngine.decodeState(result.encryptedBlob)
    expect(decoded.processName).toBe('cmd.exe')
    expect(decoded.cwd).toBe('C:\\Projects\\REWIND')
    expect(decoded.history).toEqual(['cd REWIND', 'npm test'])
    expect(decoded.buffer).toContain('npm test')
  })

  it('enforces 5 MiB maximum limit on uncompressed payload', () => {
    const hugeBuffer = 'A'.repeat(MAX_STATE_SIZE_BYTES + 1024)
    const info = {
      processName: 'cmd.exe',
      buffer: hugeBuffer,
    }

    expect(() => StateCaptureEngine.captureState(info)).toThrow(/exceeds maximum limit of 5 MiB/)
  })

  it('resurrects terminal with executed-command disclaimer notification', async () => {
    const mockChild = {
      unref: vi.fn(),
      on: vi.fn(),
    }
    const mockSpawn = vi.fn().mockReturnValue(mockChild)
    _setSpawnForTesting(mockSpawn)

    const state = {
      appType: 'terminal',
      processName: 'cmd.exe',
      exePath: 'cmd.exe',
      cwd: process.cwd(),
      history: ['git status'],
    }

    const res = await StateCaptureEngine.resurrectState(state)
    expect(res.success).toBe(true)
    expect(res.action).toBe('resurrected_terminal')
    expect(res.disclaimer).toBe(TERMINAL_DISCLAIMER)
    expect(mockSpawn).toHaveBeenCalled()
    expect(mockChild.unref).toHaveBeenCalled()
    expect(mockChild.on).toHaveBeenCalledWith('error', expect.any(Function))
  })
})
