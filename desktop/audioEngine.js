/**
 * REWIND Desktop Tactile Audio Engine
 * Provides synthesized mechanical tick and pneumatic whoosh audio feedback
 * for timeline scrubbing and state resurrection with zero external asset dependencies.
 */

export class AudioEngine {
  constructor() {
    this.muted = false
    this.audioContext = null
  }

  /**
   * Sets mute state.
   * @param {boolean} muted
   */
  setMuted(muted) {
    this.muted = !!muted
  }

  isMuted() {
    return this.muted
  }

  getAudioContext() {
    if (this.audioContext) return this.audioContext
    if (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
      const Ctx = window.AudioContext || window.webkitAudioContext
      try {
        this.audioContext = new Ctx()
      } catch {
        // audio context creation suppressed
      }
    }
    return this.audioContext
  }

  /**
   * Synthesizes a crisp, subtle mechanical click/tick for scrubber movement.
   * Frequency: 1800Hz decaying rapidly in 25ms.
   */
  playTick() {
    if (this.muted) return false
    const ctx = this.getAudioContext()
    if (!ctx) return false

    try {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'triangle'
      osc.frequency.setValueAtTime(1800, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.025)

      gain.gain.setValueAtTime(0.08, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.025)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.025)
      return true
    } catch {
      return false
    }
  }

  /**
   * Synthesizes a satisfying pneumatic retro-futuristic whoosh for resurrection.
   * Low pass sweep from 150Hz up to 600Hz then soft decay over 120ms.
   */
  playResurrect() {
    if (this.muted) return false
    const ctx = this.getAudioContext()
    if (!ctx) return false

    try {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(150, ctx.currentTime)
      osc.frequency.exponentialRampToValueAtTime(650, ctx.currentTime + 0.08)
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.16)

      gain.gain.setValueAtTime(0.12, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.16)
      return true
    } catch {
      return false
    }
  }

  /**
   * Generates a RIFF WAV buffer for a mechanical tick (for export or offline playback).
   * @returns {Buffer}
   */
  static generateWavTick() {
    const sampleRate = 22050
    const durationSec = 0.03
    const numSamples = Math.floor(sampleRate * durationSec)
    const buffer = Buffer.alloc(44 + numSamples * 2)

    // RIFF header
    buffer.write('RIFF', 0)
    buffer.writeUInt32LE(36 + numSamples * 2, 4)
    buffer.write('WAVE', 8)
    buffer.write('fmt ', 12)
    buffer.writeUInt32LE(16, 16) // Subchunk1Size
    buffer.writeUInt16LE(1, 20)  // PCM
    buffer.writeUInt16LE(1, 22)  // Mono
    buffer.writeUInt32LE(sampleRate, 24)
    buffer.writeUInt32LE(sampleRate * 2, 28) // ByteRate
    buffer.writeUInt16LE(2, 32)  // BlockAlign
    buffer.writeUInt16LE(16, 34) // BitsPerSample
    buffer.write('data', 36)
    buffer.writeUInt32LE(numSamples * 2, 40)

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate
      const freq = 1800 * Math.exp(-t * 80)
      const sample = Math.sin(2 * Math.PI * freq * t) * Math.exp(-t * 60) * 0.4
      const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)))
      buffer.writeInt16LE(intSample, 44 + i * 2)
    }

    return buffer
  }
}

export const defaultAudio = new AudioEngine()
