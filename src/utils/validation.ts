import type { Recording, RecordingEvent, RecordingEventKind } from '../types/recording'

/**
 * Validates whether an unknown value conforms to the RecordingEvent specification.
 */
export function isValidRecordingEvent(value: unknown): value is RecordingEvent {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<RecordingEvent>

  const validKinds: RecordingEventKind[] = ['click', 'type', 'scroll']

  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.timestamp === 'number' &&
    candidate.timestamp >= 0 &&
    typeof candidate.kind === 'string' &&
    validKinds.includes(candidate.kind as RecordingEventKind) &&
    typeof candidate.icon === 'string' &&
    typeof candidate.label === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.category === 'string' &&
    typeof candidate.target === 'string'
  )
}

/**
 * Validates whether an unknown parsed JSON document is a valid REWIND Recording.
 */
export function isValidRecording(value: unknown): value is Recording {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Recording>

  if (candidate.schemaVersion !== 1) return false
  if (typeof candidate.id !== 'string' || candidate.id.trim().length === 0) return false
  if (typeof candidate.title !== 'string' || candidate.title.trim().length === 0) return false
  if (typeof candidate.duration !== 'number' || candidate.duration < 0) return false
  if (typeof candidate.createdAt !== 'string' || Number.isNaN(Date.parse(candidate.createdAt))) return false
  if (!Array.isArray(candidate.events) || candidate.events.length === 0) return false

  return candidate.events.every((event) => isValidRecordingEvent(event))
}

/**
 * Detects whether an HTML input element contains sensitive user data (e.g. passwords, card details).
 */
export function isSensitiveField(element: HTMLInputElement | HTMLTextAreaElement): boolean {
  if (element instanceof HTMLInputElement && element.type === 'password') {
    return true
  }

  const autocomplete = element.getAttribute('autocomplete') || ''
  if (autocomplete.includes('cc-') || autocomplete === 'current-password' || autocomplete === 'new-password') {
    return true
  }

  const searchBag = `${element.name} ${element.id} ${autocomplete} ${element.getAttribute('aria-label') || ''}`
  return /password|passcode|card|credit|cvv|cvc|secret|token/i.test(searchBag)
}
