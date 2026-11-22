import { describe, expect, it } from 'vitest'
import { getUndoFeedbackMessage } from '../undoFeedback'

describe('undo feedback selection', () => {
  it('returns no feedback when both undo feedback and selected moment are absent', () => {
    expect(getUndoFeedbackMessage(null, null)).toBeNull()
  })

  it('shows feedback only for the selected moment', () => {
    expect(getUndoFeedbackMessage({ momentId: 'moment-1', message: 'Undone' }, 'moment-1')).toBe('Undone')
    expect(getUndoFeedbackMessage({ momentId: 'moment-1', message: 'Undone' }, 'moment-2')).toBeNull()
  })
})
