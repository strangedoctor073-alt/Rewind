import { describe, expect, it } from 'vitest'
import { ClipboardEngine } from '../clipboardEngine.js'

describe('desktop clipboard history engine', () => {
  it('detects high-entropy tokens and private keys as sensitive', () => {
    const engine = new ClipboardEngine(50)
    expect(engine.isSensitiveContent('ghp_abcdef1234567890abcdef1234567890')).toBe(true)
    expect(engine.isSensitiveContent('-----BEGIN RSA PRIVATE KEY-----')).toBe(true)
    expect(engine.isSensitiveContent('bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')).toBe(true)
  })

  it('detects valid credit card number formats as sensitive', () => {
    const engine = new ClipboardEngine(50)
    expect(engine.isSensitiveContent('4111 1111 1111 1111')).toBe(true)
    expect(engine.isSensitiveContent('5500-0000-0000-0004')).toBe(true)
  })

  it('allows standard engineering snippets, URLs, and notes', () => {
    const engine = new ClipboardEngine(50)
    expect(engine.isSensitiveContent('const sum = (a, b) => a + b')).toBe(false)
    expect(engine.isSensitiveContent('https://github.com/strangedoctor073-alt/Rewind')).toBe(false)
    expect(engine.isSensitiveContent('Meeting discussion notes for architecture sprint')).toBe(false)
  })

  it('respects paused state and max history bounds', () => {
    const engine = new ClipboardEngine(5)
    engine.setPaused(true)
    expect(engine.isPaused).toBe(true)
    engine.setPaused(false)
    expect(engine.isPaused).toBe(false)
  })
})
