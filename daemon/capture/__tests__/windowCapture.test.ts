import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WindowCaptureEngine } from '../windowCapture.js'

vi.mock('node:fs', () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
  },
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  renameSync: vi.fn(),
}))

describe('WindowCaptureEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('constructs with custom storage dir and threshold', () => {
    const engine = new WindowCaptureEngine({
      storageDir: '/fake/screenshots',
      dhashThreshold: 6,
    })
    expect(engine.getStorageDir()).toBe('/fake/screenshots')
    expect(engine.getLastPhash()).toBe('')
  })

  it('captures frame with mock native driver', async () => {
    const mockDriver = {
      getActiveWindowHandle: vi.fn(() => 99999),
      getWindowDimensions: vi.fn(() => ({ width: 100, height: 100, x: 10, y: 10 })),
      captureWindowPixels: vi.fn(() => new Uint8Array(100 * 100 * 4).fill(200)),
    }

    const engine = new WindowCaptureEngine({
      storageDir: '/fake/screenshots',
      nativeDriver: mockDriver,
    })

    const frame = await engine.captureActiveWindow('test-moment-1')
    expect(frame).not.toBeNull()
    expect(frame?.hwnd).toBe(99999)
    expect(frame?.isChanged).toBe(true)
    expect(typeof frame?.phash).toBe('string')
    expect(engine.getLastPhash()).toBe(frame?.phash)
  })

  it('skips duplicate write when frame has not changed', async () => {
    const pixels = new Uint8Array(50 * 50 * 4).fill(120)
    const mockDriver = {
      getActiveWindowHandle: vi.fn(() => 88888),
      getWindowDimensions: vi.fn(() => ({ width: 50, height: 50, x: 0, y: 0 })),
      captureWindowPixels: vi.fn(() => pixels),
    }

    const engine = new WindowCaptureEngine({
      storageDir: '/fake/screenshots',
      nativeDriver: mockDriver,
    })

    const f1 = await engine.captureActiveWindow('m1')
    expect(f1?.isChanged).toBe(true)

    const f2 = await engine.captureActiveWindow('m2')
    expect(f2?.isChanged).toBe(false)
  })

  it('returns null when no active window handle is found', async () => {
    const mockDriver = {
      getActiveWindowHandle: vi.fn(() => null),
      getWindowDimensions: vi.fn(() => ({ width: 0, height: 0, x: 0, y: 0 })),
      captureWindowPixels: vi.fn(() => null),
    }

    const engine = new WindowCaptureEngine({ nativeDriver: mockDriver })
    const frame = await engine.captureActiveWindow('m3')
    expect(frame).toBeNull()
  })
})
