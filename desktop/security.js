/**
 * REWIND Desktop Security & Privacy Filter
 * Strict privacy guardrails ensuring sensitive processes, credential managers,
 * banking windows, and incognito sessions are NEVER captured or logged.
 */

const DENIED_PROCESSES = new Set([
  '1password.exe',
  'bitwarden.exe',
  'keepass.exe',
  'keepassxc.exe',
  'dashlane.exe',
  'lastpass.exe',
  'credentialmanager.exe',
  'mstsc.exe',
  'securityhealthsystray.exe',
  'consent.exe', // Windows UAC Elevation prompt
])

const DENIED_KEYWORDS = [
  'private browsing',
  'incognito',
  'password',
  'master password',
  'sign in',
  'login',
  'pin entry',
  'windows security',
  'bitwarden',
  '1password',
  'keepass',
  'authenticator',
  'two-factor',
  'credit card',
  'cvv',
]

/**
 * Checks if a process executable name is permitted for recording.
 * @param {string} processName
 * @returns {boolean}
 */
export function isProcessAllowed(processName) {
  if (!processName || typeof processName !== 'string') return false
  const normalized = processName.toLowerCase().trim()
  return !DENIED_PROCESSES.has(normalized)
}

/**
 * Checks if a window title contains sensitive terms.
 * @param {string} windowTitle
 * @returns {boolean}
 */
export function isWindowTitleAllowed(windowTitle) {
  if (!windowTitle || typeof windowTitle !== 'string') return true
  const lower = windowTitle.toLowerCase()
  return !DENIED_KEYWORDS.some((keyword) => lower.includes(keyword))
}

/**
 * Validates whether an application window may be tracked.
 * @param {string} processName
 * @param {string} windowTitle
 * @returns {boolean}
 */
export function isWindowAllowed(processName, windowTitle) {
  return isProcessAllowed(processName) && isWindowTitleAllowed(windowTitle)
}

/**
 * Sanitizes window titles to strip out any potential card or account numbers.
 * @param {string} title
 * @returns {string}
 */
export function sanitizeWindowTitle(title) {
  if (!title) return ''
  // Redact potential 13-19 digit card numbers
  return title.replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED_NUM]')
}
