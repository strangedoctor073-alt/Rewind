import { describe, expect, it } from 'vitest'
import { isSensitiveField, isValidRecording, isValidRecordingEvent } from '../validation'

describe('validation utils', () => {
  describe('isValidRecordingEvent', () => {
    it('validates a valid recording event', () => {
      const validEvent = {
        id: 'ev-1',
        timestamp: 120,
        kind: 'click',
        icon: 'CLICK',
        label: 'Clicked button',
        description: 'Button clicked',
        category: 'Pointer interaction',
        target: 'btn-test',
      }
      expect(isValidRecordingEvent(validEvent)).toBe(true)
    })

    it('rejects invalid kind or negative timestamp', () => {
      expect(isValidRecordingEvent({ id: '1', timestamp: -10, kind: 'click' })).toBe(false)
      expect(isValidRecordingEvent({ id: '1', timestamp: 10, kind: 'unknown' })).toBe(false)
      expect(isValidRecordingEvent(null)).toBe(false)
      expect(isValidRecordingEvent({})).toBe(false)
    })
  })

  describe('isValidRecording', () => {
    it('validates a correct Recording schema v1', () => {
      const validRecording = {
        schemaVersion: 1,
        id: 'rec-123',
        title: 'Checkout Flow',
        duration: 2500,
        createdAt: new Date().toISOString(),
        events: [
          {
            id: 'ev-1',
            timestamp: 0,
            kind: 'click',
            icon: 'START',
            label: 'Recording started',
            description: 'Started',
            category: 'Recording',
            target: 'body',
          },
        ],
      }
      expect(isValidRecording(validRecording)).toBe(true)
    })

    it('rejects recordings with wrong schemaVersion or invalid dates', () => {
      expect(isValidRecording({ schemaVersion: 2 })).toBe(false)
      expect(isValidRecording({ schemaVersion: 1, id: '1', title: 'T', duration: 100, createdAt: 'invalid-date', events: [] })).toBe(false)
      expect(isValidRecording({ schemaVersion: 1, id: '1', title: '', duration: 100, createdAt: new Date().toISOString(), events: [] })).toBe(false)
    })
  })

  describe('isSensitiveField', () => {
    it('identifies password type inputs as sensitive', () => {
      const input = document.createElement('input')
      input.type = 'password'
      expect(isSensitiveField(input)).toBe(true)
    })

    it('identifies credit card autocomplete fields as sensitive', () => {
      const input = document.createElement('input')
      input.setAttribute('autocomplete', 'cc-number')
      expect(isSensitiveField(input)).toBe(true)
    })

    it('identifies fields with token, cvv, or passcode names/labels as sensitive', () => {
      const input = document.createElement('input')
      input.name = 'user_token'
      expect(isSensitiveField(input)).toBe(true)

      const cvcInput = document.createElement('input')
      cvcInput.setAttribute('aria-label', 'Card CVV code')
      expect(isSensitiveField(cvcInput)).toBe(true)
    })

    it('allows normal non-sensitive fields', () => {
      const input = document.createElement('input')
      input.type = 'text'
      input.name = 'promo-code'
      input.placeholder = 'Enter promo'
      expect(isSensitiveField(input)).toBe(false)
    })
  })
})
