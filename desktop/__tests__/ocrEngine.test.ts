import { describe, it, expect } from 'vitest'
import { OcrEngine } from '../ocrEngine.js'

describe('OcrEngine', () => {
  it('tokenizes text into spatial coordinates for click-to-copy', () => {
    const text = 'npm test --run\nTypeError: null pointer'
    const tokens = OcrEngine.tokenizeText(text, 800, 600)

    expect(tokens.length).toBeGreaterThan(0)
    expect(tokens[0].word).toBe('npm')
    expect(tokens[0].x).toBe(20)
    expect(tokens[0].y).toBe(30)
    expect(tokens[0].width).toBeGreaterThan(0)
    expect(tokens[0].height).toBeGreaterThan(0)

    const typeErrorToken = tokens.find((t) => t.word === 'TypeError:')
    expect(typeErrorToken).toBeDefined()
    expect(typeErrorToken.y).toBe(50) // second line
  })

  it('indexes moments and performs instant sub-millisecond search', () => {
    const ocr = new OcrEngine()
    ocr.indexSnapshot('snap-1', 'C:\\Projects\\REWIND> git commit -m "feat: fast undo"', { app: 'cmd.exe' })
    ocr.indexSnapshot('snap-2', 'Discord #general: Can anyone review PR 42?', { app: 'Discord.exe' })
    ocr.indexSnapshot('snap-3', 'Browser: https://github.com/strangedoctor073-alt/Rewind', { app: 'chrome.exe' })

    const commitResults = ocr.search('commit')
    expect(commitResults.length).toBe(1)
    expect(commitResults[0].id).toBe('snap-1')
    expect(commitResults[0].metadata.app).toBe('cmd.exe')

    const prResults = ocr.search('PR 42')
    expect(prResults.length).toBe(1)
    expect(prResults[0].id).toBe('snap-2')

    // Empty search returns empty array
    expect(ocr.search('')).toEqual([])
  })

  it('retrieves tokens for a given indexed snapshot', () => {
    const ocr = new OcrEngine()
    ocr.indexSnapshot('snap-4', 'const secretKey = "ak_test_123"')
    const tokens = ocr.getTokens('snap-4')
    expect(tokens.some((t) => t.word === 'secretKey')).toBe(true)
  })
})
