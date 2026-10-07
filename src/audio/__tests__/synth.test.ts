import { describe, it, expect, beforeEach, vi } from 'vitest'
import { audioEngine } from '../synth'

describe('ProceduralAudioEngine', () => {
  beforeEach(() => {
    localStorage.clear()
    audioEngine.setMuted(false)
  })

  it('initializes unmuted by default', () => {
    expect(audioEngine.isMuted()).toBe(false)
  })

  it('toggles and persists mute state in localStorage', () => {
    const isMutedNow = audioEngine.toggleMute()
    expect(isMutedNow).toBe(true)
    expect(audioEngine.isMuted()).toBe(true)
    expect(localStorage.getItem('rewind:sound_muted')).toBe('true')

    audioEngine.toggleMute()
    expect(audioEngine.isMuted()).toBe(false)
    expect(localStorage.getItem('rewind:sound_muted')).toBe('false')
  })

  it('does not throw when play methods are invoked without native AudioContext', () => {
    expect(() => audioEngine.playTick()).not.toThrow()
    expect(() => audioEngine.playWhoosh()).not.toThrow()
    expect(() => audioEngine.playRewindSweep()).not.toThrow()
    expect(() => audioEngine.playChime()).not.toThrow()
  })

  it('executes audio graph creation when AudioContext is mocked with a class', () => {
    const mockGain = {
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }
    const mockFilter = {
      type: 'highpass',
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      Q: { setValueAtTime: vi.fn() },
      connect: vi.fn(),
    }
    const mockSource = {
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
    }
    const mockOsc = {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }

    class MockAudioContext {
      currentTime = 0
      sampleRate = 44100
      state = 'running'
      destination = {}
      createBuffer = vi.fn().mockReturnValue({
        getChannelData: vi.fn().mockReturnValue(new Float32Array(100)),
      })
      createBufferSource = vi.fn().mockReturnValue(mockSource)
      createBiquadFilter = vi.fn().mockReturnValue(mockFilter)
      createGain = vi.fn().mockReturnValue(mockGain)
      createOscillator = vi.fn().mockReturnValue(mockOsc)
      resume = vi.fn().mockResolvedValue(undefined)
    }

    // @ts-expect-error Mocking window AudioContext
    window.AudioContext = MockAudioContext

    expect(() => audioEngine.playTick()).not.toThrow()
    expect(() => audioEngine.playWhoosh()).not.toThrow()
    expect(() => audioEngine.playRewindSweep()).not.toThrow()
    expect(() => audioEngine.playChime()).not.toThrow()
  })
})
