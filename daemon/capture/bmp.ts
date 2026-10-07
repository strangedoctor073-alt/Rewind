/**
 * REWIND Native BMP Image Encoder
 * Pure-TypeScript generator for standard uncompressed 24-bit/32-bit Windows Bitmap files.
 * Zero external native library dependencies.
 */

/**
 * Encodes raw BGRA/RGBA pixel data into a standard Windows BMP buffer.
 * @param pixelData - Raw pixel bytes
 * @param width - Image width in pixels
 * @param height - Image height in pixels
 * @param bytesPerPixel - 3 for 24-bit RGB, 4 for 32-bit RGBA/BGRA (default: 4)
 * @returns Complete BMP file Buffer ready for disk persistence
 */
export function encodeBmp(
  pixelData: Uint8Array,
  width: number,
  height: number,
  bytesPerPixel = 4
): Buffer {
  const rowSize = Math.floor((width * 24 + 31) / 32) * 4
  const pixelArraySize = rowSize * height
  const fileSize = 54 + pixelArraySize // 14 byte file header + 40 byte DIB header

  const buffer = Buffer.alloc(fileSize)

  // ── BITMAPFILEHEADER (14 bytes) ─────────────────────────────────
  buffer.write('BM', 0, 'ascii')             // bfType
  buffer.writeUInt32LE(fileSize, 2)          // bfSize
  buffer.writeUInt16LE(0, 6)                 // bfReserved1
  buffer.writeUInt16LE(0, 8)                 // bfReserved2
  buffer.writeUInt32LE(54, 10)               // bfOffBits (header offset)

  // ── BITMAPINFOHEADER (40 bytes) ─────────────────────────────────
  buffer.writeUInt32LE(40, 14)               // biSize
  buffer.writeInt32LE(width, 18)             // biWidth
  buffer.writeInt32LE(height, 22)            // biHeight (positive = bottom-up)
  buffer.writeUInt16LE(1, 26)                // biPlanes
  buffer.writeUInt16LE(24, 28)               // biBitCount (24bpp standard RGB)
  buffer.writeUInt32LE(0, 30)                // biCompression (BI_RGB = uncompressed)
  buffer.writeUInt32LE(pixelArraySize, 34)   // biSizeImage
  buffer.writeInt32LE(2835, 38)              // biXPelsPerMeter (72 DPI)
  buffer.writeInt32LE(2835, 42)              // biYPelsPerMeter (72 DPI)
  buffer.writeUInt32LE(0, 46)                // biClrUsed
  buffer.writeUInt32LE(0, 50)                // biClrImportant

  // ── Pixel Data (Bottom-up, BGR order) ───────────────────────────
  let destOffset = 54

  for (let y = height - 1; y >= 0; y--) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * bytesPerPixel
      const b = pixelData[srcIdx + 2] ?? 0
      const g = pixelData[srcIdx + 1] ?? 0
      const r = pixelData[srcIdx] ?? 0

      buffer[destOffset++] = b
      buffer[destOffset++] = g
      buffer[destOffset++] = r
    }

    // Pad row to 4-byte boundary
    const padding = rowSize - (width * 3)
    for (let p = 0; p < padding; p++) {
      buffer[destOffset++] = 0
    }
  }

  return buffer
}
