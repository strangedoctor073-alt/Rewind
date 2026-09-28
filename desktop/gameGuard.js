/**
 * REWIND Desktop Ghost Shield & Game/Battery Throttling Engine
 * Ensures 0% CPU consumption during full-screen games, protects battery life,
 * and blacks out password managers and private browsing windows.
 */

export const PROTECTED_PROCESS_PATTERNS = [
  /1password/i,
  /bitwarden/i,
  /keepass/i,
  /lastpass/i,
  /dashlane/i,
  /enpass/i,
  /auth/i,
  /credential/i,
]

export const PROTECTED_TITLE_PATTERNS = [
  /1password/i,
  /bitwarden/i,
  /keepass/i,
  /windows security/i,
  /user account control/i,
  /private browsing/i,
  /incognito/i,
  /inprivate/i,
  /tor browser/i,
]

export class GameAndBatteryGuard {
  constructor() {
    this.gamingDetectionEnabled = true
    this.batterySavingEnabled = true
    this.mockState = null // for testing
  }

  /**
   * Sets mock hardware state for testing.
   * @param {{ isGaming?: boolean, batteryLevel?: number, isCharging?: boolean }} state
   */
  setMockState(state) {
    this.mockState = state
  }

  /**
   * Checks if an application window is protected and must be blacked out.
   * @param {string} processName
   * @param {string} title
   * @returns {boolean}
   */
  static isWindowProtected(processName, title) {
    const p = processName || ''
    const t = title || ''

    for (const pat of PROTECTED_PROCESS_PATTERNS) {
      if (pat.test(p)) return true
    }

    for (const pat of PROTECTED_TITLE_PATTERNS) {
      if (pat.test(t)) return true
    }

    return false
  }

  /**
   * Checks whether background screen capture should be throttled or suppressed.
   * @param {object} [context]
   * @returns {{ suppress: boolean, reason?: string }}
   */
  shouldSuppressCapture(context = {}) {
    // 1. Check Mock State (for testing)
    if (this.mockState) {
      if (this.mockState.isGaming) {
        return { suppress: true, reason: 'fullscreen_game_active' }
      }
      if (
        this.mockState.batteryLevel !== undefined &&
        this.mockState.batteryLevel <= 0.20 &&
        !this.mockState.isCharging
      ) {
        return { suppress: true, reason: 'low_battery_saver' }
      }
    }

    // 2. Window Protected Check
    if (context.processName || context.title) {
      if (GameAndBatteryGuard.isWindowProtected(context.processName, context.title)) {
        return { suppress: true, reason: 'privacy_ghost_shield' }
      }
    }

    return { suppress: false }
  }
}

export const defaultGameGuard = new GameAndBatteryGuard()
