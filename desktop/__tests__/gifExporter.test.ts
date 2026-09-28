import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { GifExporter } from '../gifExporter.js'

describe('GifExporter', () => {
  it('filters events within the 5-second moment duration', () => {
    const now = Date.now()
    const events = [
      { id: '1', timestamp: now - 1000 },
      { id: '2', timestamp: now - 3000 },
      { id: '3', timestamp: now - 4900 },
      { id: '4', timestamp: now - 8000 },
    ]

    const selected = GifExporter.selectMomentEvents(events, 5000)
    expect(selected.map((e) => e.id)).toEqual(['1', '2', '3'])
  })

  it('encodes an animated GIF89a with loop extension and valid trailer', () => {
    const frameData1 = Buffer.alloc(40 * 30)
    frameData1.fill(128)
    const frameData2 = Buffer.alloc(40 * 30)
    frameData2.fill(200)

    const frames = [
      { width: 40, height: 30, data: frameData1 },
      { width: 40, height: 30, data: frameData2 },
    ]

    const gif = GifExporter.encodeGif(frames, 20)
    expect(gif).toBeInstanceOf(Buffer)
    expect(gif.subarray(0, 6).toString('ascii')).toBe('GIF89a')
    // GIF trailer must be 0x3b (';')
    expect(gif[gif.length - 1]).toBe(0x3b)
    // Netscape loop block present
    expect(gif.toString('ascii')).toContain('NETSCAPE2.0')
  })

  it('exports a 5-second moment to disk and returns metadata', () => {
    const tmpDir = path.join(os.tmpdir(), `rewind_test_${Date.now()}`)
    const events = [
      { id: 'evt-1', timestamp: Date.now() - 500, title: 'VS Code' },
      { id: 'evt-2', timestamp: Date.now() - 1500, title: 'Terminal' },
    ]

    const result = GifExporter.export5SecondMoment(events, tmpDir)
    expect(fs.existsSync(result.filePath)).toBe(true)
    expect(result.sizeBytes).toBeGreaterThan(0)
    expect(result.frameCount).toBe(2)

    // Cleanup
    try {
      fs.unlinkSync(result.filePath)
      fs.rmdirSync(tmpDir)
    } catch {
      // ignore
    }
  })
})
