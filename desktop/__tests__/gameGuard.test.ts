import { describe, it, expect } from 'vitest'
import { GameAndBatteryGuard } from '../gameGuard.js'

describe('GameAndBatteryGuard', () => {
  it('detects and blacks out protected password managers and incognito windows', () => {
    expect(GameAndBatteryGuard.isWindowProtected('1Password.exe', '1Password Vault')).toBe(true)
    expect(GameAndBatteryGuard.isWindowProtected('chrome.exe', 'New Incognito Tab - Google Chrome')).toBe(true)
    expect(GameAndBatteryGuard.isWindowProtected('msedge.exe', 'InPrivate browsing')).toBe(true)
    expect(GameAndBatteryGuard.isWindowProtected('Code.exe', 'main.rs - REWIND - Visual Studio Code')).toBe(false)
  })

  it('suppresses capture when full-screen 3D game is active', () => {
    const guard = new GameAndBatteryGuard()
    guard.setMockState({ isGaming: true })

    const res = guard.shouldSuppressCapture()
    expect(res.suppress).toBe(true)
    expect(res.reason).toBe('fullscreen_game_active')
  })

  it('throttles capture when laptop battery is low and unplugged', () => {
    const guard = new GameAndBatteryGuard()
    guard.setMockState({ isGaming: false, batteryLevel: 0.15, isCharging: false })

    const res = guard.shouldSuppressCapture()
    expect(res.suppress).toBe(true)
    expect(res.reason).toBe('low_battery_saver')
  })

  it('allows capture under normal conditions', () => {
    const guard = new GameAndBatteryGuard()
    guard.setMockState({ isGaming: false, batteryLevel: 0.85, isCharging: true })

    const res = guard.shouldSuppressCapture({ processName: 'notepad.exe', title: 'notes.txt' })
    expect(res.suppress).toBe(false)
  })
})
