/**
 * REWIND Desktop 5-Second GIF Moment Exporter
 * Encodes recorded screen moments into an animated GIF89a for fast bug reports and sharing.
 */

import fs from 'node:fs'
import path from 'node:path'

/**
 * Lightweight pure-JS GIF89a animated builder.
 */
export class GifExporter {
  /**
   * Filters events within the last 5 seconds (or specified duration).
   * @param {Array<object>} events
   * @param {number} [durationMs=5000]
   * @returns {Array<object>}
   */
  static selectMomentEvents(events, durationMs = 5000) {
    if (!Array.isArray(events) || events.length === 0) return []
    const latestTs = events[0]?.timestamp || Date.now()
    const cutoff = latestTs - durationMs
    return events.filter((e) => e.timestamp >= cutoff)
  }

  /**
   * Creates an animated GIF buffer from a set of RGBA frames.
   * @param {Array<{ width: number, height: number, data: Uint8Array|Buffer }>} frames
   * @param {number} [delayHundredths=20] - Frame delay in 1/100 sec (20 = 200ms)
   * @returns {Buffer}
   */
  static encodeGif(frames, delayHundredths = 20) {
    if (!frames || frames.length === 0) {
      // Return a 1x1 fallback GIF
      return this.createSinglePixelGif()
    }

    const width = frames[0].width || 320
    const height = frames[0].height || 240

    const chunks = []

    // 1. Header & Logical Screen Descriptor (GIF89a)
    const header = Buffer.alloc(13)
    header.write('GIF89a', 0)
    header.writeUInt16LE(width, 6)
    header.writeUInt16LE(height, 8)
    header[10] = 0xf7 // Global Color Table Present, 256 colors (8 bits)
    header[11] = 0    // Background Color Index
    header[12] = 0    // Pixel Aspect Ratio
    chunks.push(header)

    // 2. Global Color Table (Standard 256 color grayscale/web palette)
    const gct = Buffer.alloc(256 * 3)
    for (let i = 0; i < 256; i++) {
      gct[i * 3 + 0] = i // R
      gct[i * 3 + 1] = i // G
      gct[i * 3 + 2] = i // B
    }
    chunks.push(gct)

    // 3. Netscape 2.0 Loop Block (Repeat Forever)
    const loopExt = Buffer.from([
      0x21, 0xff, 0x0b, // Extension Intro + App block (11 bytes)
      0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30, // "NETSCAPE2.0"
      0x03, 0x01, 0x00, 0x00, // Subblock size 3, loop sub-id 1, loop count 0 (infinite)
      0x00 // Block terminator
    ])
    chunks.push(loopExt)

    // 4. Frames
    for (let f = 0; f < frames.length; f++) {
      const frame = frames[f]
      // Graphic Control Extension (delay)
      const gce = Buffer.alloc(8)
      gce[0] = 0x21 // Extension Intro
      gce[1] = 0xf9 // Graphic Control Label
      gce[2] = 0x04 // Block Size
      gce[3] = 0x04 // Disposal method (restore to background)
      gce.writeUInt16LE(delayHundredths, 4) // Delay Time in 1/100s
      gce[6] = 0x00 // Transparent color index
      gce[7] = 0x00 // Block Terminator
      chunks.push(gce)

      // Image Descriptor
      const imgDesc = Buffer.alloc(10)
      imgDesc[0] = 0x2c // Image Separator ','
      imgDesc.writeUInt16LE(0, 1) // Image Left
      imgDesc.writeUInt16LE(0, 3) // Image Top
      imgDesc.writeUInt16LE(width, 5)
      imgDesc.writeUInt16LE(height, 7)
      imgDesc[9] = 0x00 // No local color table
      chunks.push(imgDesc)

      // Uncompressed LZW raster data block
      const rasterData = this.buildFrameRaster(frame, width, height)
      chunks.push(rasterData)
    }

    // 5. Trailer
    chunks.push(Buffer.from([0x3b])) // ';'

    return Buffer.concat(chunks)
  }

  /**
   * Builds raster LZW payload for a frame.
   * @private
   */
  static buildFrameRaster(frame, width, height) {
    const minCodeSize = 8
    const numPixels = width * height
    const indices = new Uint8Array(numPixels)

    if (frame.data && frame.data.length >= numPixels) {
      for (let i = 0; i < numPixels; i++) {
        // Map luminance to 0..255 index
        const offset = i * 4
        if (offset + 2 < frame.data.length) {
          const r = frame.data[offset]
          const g = frame.data[offset + 1]
          const b = frame.data[offset + 2]
          indices[i] = Math.floor(0.299 * r + 0.587 * g + 0.114 * b)
        } else {
          indices[i] = frame.data[i] || 0
        }
      }
    }

    const blocks = []
    blocks.push(Buffer.from([minCodeSize]))

    // Simple clear code + literal tokens stream
    const clearCode = 1 << minCodeSize
    const eoiCode = clearCode + 1

    let bitBuf = 0
    let bitCount = 0
    const codeSize = minCodeSize + 1
    const outputBytes = []

    function emitCode(code) {
      bitBuf |= code << bitCount
      bitCount += codeSize
      while (bitCount >= 8) {
        outputBytes.push(bitBuf & 0xff)
        bitBuf >>= 8
        bitCount -= 8
      }
    }

    emitCode(clearCode)
    for (let i = 0; i < numPixels; i++) {
      emitCode(indices[i])
      if (outputBytes.length > 200000) break // limit frame raster size
    }
    emitCode(eoiCode)

    if (bitCount > 0) {
      outputBytes.push(bitBuf & 0xff)
    }

    // Packetize into max 255-byte sub-blocks
    let offset = 0
    while (offset < outputBytes.length) {
      const chunkSize = Math.min(254, outputBytes.length - offset)
      const subBlock = Buffer.alloc(chunkSize + 1)
      subBlock[0] = chunkSize
      for (let b = 0; b < chunkSize; b++) {
        subBlock[b + 1] = outputBytes[offset + b]
      }
      blocks.push(subBlock)
      offset += chunkSize
    }
    blocks.push(Buffer.from([0x00])) // Block terminator

    return Buffer.concat(blocks)
  }

  static createSinglePixelGif() {
    // 1x1 transparent GIF89a
    return Buffer.from([
      0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x01, 0x00, 0x01, 0x00, 0x80, 0x00,
      0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0x21, 0xf9, 0x04, 0x01, 0x00,
      0x00, 0x00, 0x00, 0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
      0x00, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b,
    ])
  }

  /**
   * Exports the last 5 seconds of moments as an animated GIF to a specified directory.
   * @param {Array<object>} events
   * @param {string} outputDir
   * @returns {{ filePath: string, sizeBytes: number, frameCount: number }}
   */
  static export5SecondMoment(events, outputDir) {
    const momentEvents = this.selectMomentEvents(events, 5000)
    const targetDir = outputDir || process.cwd()

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true })
    }

    const timestamp = Date.now()
    const filename = `rewind_moment_${timestamp}.gif`
    const filePath = path.join(targetDir, filename)

    // Generate dummy preview frames for events
    const frames = momentEvents.map((evt, idx) => {
      const data = Buffer.alloc(120 * 80)
      data.fill((idx * 40) % 255)
      return { width: 120, height: 80, data, title: evt.title }
    })

    const gifBuffer = this.encodeGif(frames.length > 0 ? frames : [{ width: 120, height: 80, data: Buffer.alloc(120 * 80) }])
    fs.writeFileSync(filePath, gifBuffer)

    return {
      filePath,
      sizeBytes: gifBuffer.length,
      frameCount: Math.max(1, frames.length),
    }
  }
}
