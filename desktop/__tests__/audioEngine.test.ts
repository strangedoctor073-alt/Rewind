import { describe, it, expect } from 'vitest'
import { AudioEngine } from '../audioEngine.js'

describe('AudioEngine', () => {
  it('manages mute state accurately', () => {
    const audio = new AudioEngine()
    expect(audio.isMuted()).toBe(false)

    audio.setMuted(true)
    expect(audio.isMuted()).toBe(true)

    // When muted, playTick and playResurrect return false
    expect(audio.playTick()).toBe(false)
    expect(audio.playResurrect()).toBe(false)
  })

  it('generates a valid RIFF WAVE buffer for mechanical tick feedback', () => {
    const wav = AudioEngine.generateWavTick()
    expect(wav).toBeInstanceOf(Buffer)
    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF')
    expect(wav.subarray(8, 12).toString('ascii')).toBe('WAVE')
    expect(wav.subarray(12, 16).toString('ascii')).toBe('fmt ')
    expect(wav.subarray(36, 40).toString('ascii')).toBe('data')
    expect(wav.length).toBeGreaterThan(44)
  })
})
