import { describe, it, expect } from 'vitest'
import { computeDHash, hammingDistance, isSignificantlyDifferent } from '../phash.js'

describe('computeDHash', () => {
  it('returns zero hash for too small dimensions', () => {
    const pixels = new Uint8Array(10)
    expect(computeDHash(pixels, 4, 4)).toBe('0000000000000000')
  })

  it('computes a 16-character hex string for valid pixel buffer', () => {
    const w = 64
    const h = 64
    const pixels = new Uint8Array(w * h * 4)
    // Create a horizontal gradient
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4
        pixels[idx] = x * 3     // R
        pixels[idx + 1] = x * 3 // G
        pixels[idx + 2] = x * 3 // B
        pixels[idx + 3] = 255   // A
      }
    }

    const hash = computeDHash(pixels, w, h, 4)
    expect(typeof hash).toBe('string')
    expect(hash.length).toBe(16)
    expect(/^[0-9a-f]{16}$/i.test(hash)).toBe(true)
  })

  it('returns identical hash for identical pixel buffers', () => {
    const w = 32
    const h = 32
    const p1 = new Uint8Array(w * h * 4).fill(100)
    const p2 = new Uint8Array(w * h * 4).fill(100)
    expect(computeDHash(p1, w, h, 4)).toBe(computeDHash(p2, w, h, 4))
  })
})

describe('hammingDistance & isSignificantlyDifferent', () => {
  it('returns 0 for identical hashes', () => {
    const hash = 'a1b2c3d4e5f60718'
    expect(hammingDistance(hash, hash)).toBe(0)
    expect(isSignificantlyDifferent(hash, hash)).toBe(false)
  })

  it('calculates correct bit differences', () => {
    // 0x0 vs 0x1 -> 1 bit difference
    const h1 = '0000000000000000'
    const h2 = '0000000000000001'
    expect(hammingDistance(h1, h2)).toBe(1)
    expect(isSignificantlyDifferent(h1, h2, 4)).toBe(false)

    // 0x0 vs 0xf -> 4 bit difference
    const h3 = '000000000000000f'
    expect(hammingDistance(h1, h3)).toBe(4)
    expect(isSignificantlyDifferent(h1, h3, 3)).toBe(true)
  })

  it('handles invalid inputs gracefully', () => {
    expect(hammingDistance('', '123')).toBe(64)
  })
})
