/**
 * Ghost Shield for the daemon (Trap 5 in AGENTS.md).
 *
 * Windows whose process or title looks sensitive must never be captured,
 * indexed or resurrected. This mirrors `desktop/security.js`; a parity test
 * (`daemon/__tests__/privacy.test.ts`) keeps the two lists from drifting.
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
  'consent.exe', // Windows UAC elevation prompt
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

/** True when a window may be recorded. Unknown/missing values are treated as allowed titles, denied processes only by name. */
export function isWindowAllowed(processName: string | undefined, windowTitle: string | undefined): boolean {
  if (processName && DENIED_PROCESSES.has(processName.toLowerCase().trim())) return false
  if (windowTitle) {
    const lower = windowTitle.toLowerCase()
    if (DENIED_KEYWORDS.some((k) => lower.includes(k))) return false
  }
  return true
}

/** Redact anything that looks like a 13-19 digit card number from a window title. Mirrors desktop/security.js. */
export function sanitizeWindowTitle(title: string | undefined): string {
  if (!title) return ''
  return title.replace(/\b(?:\d[ -]*?){13,19}\b/g, '[REDACTED_NUM]')
}
