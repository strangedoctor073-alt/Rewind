/**
 * REWIND Procedural Web Audio Synthesizer
 * 0-byte asset overhead — all audio is synthesized at runtime via Web Audio API.
 * Provides tactile, retro-futuristic mechanical ticks, whooshes, and chimes.
 */

class ProceduralAudioEngine {
  private ctx: AudioContext | null = null
  private muted: boolean = false

  constructor() {
    // Read persisted mute state if in browser environment
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      this.muted = localStorage.getItem('rewind:sound_muted') === 'true'
    }
  }

  private initContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioContextClass) {
        this.ctx = new AudioContextClass()
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {})
    }
    return this.ctx
  }

  public isMuted(): boolean {
    return this.muted
  }

  public setMuted(muted: boolean): void {
    this.muted = muted
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('rewind:sound_muted', muted ? 'true' : 'false')
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted)
    return this.muted
  }

  /**
   * Crisp mechanical tick for scrubbing past timeline moments.
   * Synthesized using a 4ms shaped noise burst through a high-pass filter.
   */
  public playTick(pitchMultiplier = 1.0): void {
    if (this.muted) return
    const ctx = this.initContext()
    if (!ctx) return

    const now = ctx.currentTime
    const bufferSize = Math.floor(ctx.sampleRate * 0.005) // 5ms burst
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)

    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3))
    }

    const noise = ctx.createBufferSource()
    noise.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    filter.frequency.setValueAtTime(2400 * pitchMultiplier, now)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.005)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)

    noise.start(now)
  }

  /**
   * Pneumatic whoosh upon window or state resurrection / jump.
   * Frequency-modulated bandpass sweep from 350Hz to 1600Hz.
   */
  public playWhoosh(): void {
    if (this.muted) return
    const ctx = this.initContext()
    if (!ctx) return

    const now = ctx.currentTime
    const duration = 0.14 // 140ms

    const bufferSize = Math.floor(ctx.sampleRate * duration)
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1
    }

    const noise = ctx.createBufferSource()
    noise.buffer = buffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.Q.setValueAtTime(3.0, now)
    filter.frequency.setValueAtTime(350, now)
    filter.frequency.exponentialRampToValueAtTime(1600, now + duration * 0.7)
    filter.frequency.exponentialRampToValueAtTime(500, now + duration)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.01, now)
    gain.gain.linearRampToValueAtTime(0.2, now + duration * 0.3)
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)

    noise.start(now)
  }

  /**
   * Pitch-shifted tape rewind sweep when scrubbing backwards.
   */
  public playRewindSweep(): void {
    if (this.muted) return
    const ctx = this.initContext()
    if (!ctx) return

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sawtooth'
    osc.frequency.setValueAtTime(900, now)
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.12)

    gain.gain.setValueAtTime(0.08, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.12)
  }

  /**
   * Delicate crystal chime upon checkpoint creation or state capture.
   */
  public playChime(): void {
    if (this.muted) return
    const ctx = this.initContext()
    if (!ctx) return

    const now = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, now)
    osc.frequency.setValueAtTime(1320, now + 0.05)

    gain.gain.setValueAtTime(0.1, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.22)
  }
}

export const audioEngine = new ProceduralAudioEngine()
