/**
 * REWIND Perceptual Difference Hashing (dHash) Engine
 * Fast, pure-TypeScript 64-bit gradient difference hash.
 * Used to detect visual changes between window moments and skip idle duplicate frames.
 */

/**
 * Computes a 64-bit hex difference hash (dHash) from grayscale or RGB pixel buffers.
 * Samples an 9x8 grid of pixels and compares adjacent horizontal gradients (8x8 = 64 bits).
 * @param pixels - Grayscale (1 byte/px) or RGBA (4 bytes/px) buffer
 * @param width - Source image width
 * @param height - Source image height
 * @param bytesPerPixel - 1 for luminance, 3 for RGB, 4 for RGBA
 * @returns 16-character hex string representing the 64-bit perceptual hash
 */
export function computeDHash(
  pixels: Uint8Array,
  width: number,
  height: number,
  bytesPerPixel = 4
): string {
  if (width < 9 || height < 8 || pixels.length < width * height * bytesPerPixel) {
    return '0000000000000000'
  }

  // Sample 9 horizontal x 8 vertical points
  const grid: number[][] = []
  const stepX = Math.floor(width / 9)
  const stepY = Math.floor(height / 8)

  for (let y = 0; y < 8; y++) {
    const row: number[] = []
    const sampleY = Math.min(height - 1, y * stepY)
    for (let x = 0; x < 9; x++) {
      const sampleX = Math.min(width - 1, x * stepX)
      const offset = (sampleY * width + sampleX) * bytesPerPixel

      const brightness =
        bytesPerPixel === 1
          ? (pixels[offset] ?? 0)
          : Math.round(
              0.299 * (pixels[offset] ?? 0) +
              0.587 * (pixels[offset + 1] ?? 0) +
              0.114 * (pixels[offset + 2] ?? 0)
            )
      row.push(brightness)
    }
    grid.push(row)
  }

  // Construct 64-bit binary string: 1 if left pixel > right pixel, else 0
  let binary = ''
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      binary += grid[y][x] > grid[y][x + 1] ? '1' : '0'
    }
  }

  // Convert 64-bit binary to 16-character hex string
  let hex = ''
  for (let i = 0; i < 64; i += 4) {
    const nibble = parseInt(binary.slice(i, i + 4), 2)
    hex += nibble.toString(16)
  }

  return hex.padStart(16, '0')
}

/**
 * Computes the Hamming distance (number of differing bits) between two 16-character hex hashes.
 * Distance ranges from 0 (identical) to 64 (completely inverted).
 */
export function hammingDistance(hashA: string, hashB: string): number {
  if (!hashA || !hashB || hashA.length !== 16 || hashB.length !== 16) {
    return 64
  }

  let distance = 0
  for (let i = 0; i < 16; i++) {
    const valA = parseInt(hashA[i], 16)
    const valB = parseInt(hashB[i], 16)
    let xor = valA ^ valB
    // Count set bits in 4-bit nibble
    while (xor > 0) {
      distance += xor & 1
      xor >>= 1
    }
  }

  return distance
}

/**
 * Determines whether two hashes represent a significant visual change.
 * @param hashA - First hash
 * @param hashB - Second hash
 * @param threshold - Maximum Hamming distance allowed before considered different (default: 4 bits)
 */
export function isSignificantlyDifferent(hashA: string, hashB: string, threshold = 4): boolean {
  if (hashA === hashB) return false
  return hammingDistance(hashA, hashB) > threshold
}
