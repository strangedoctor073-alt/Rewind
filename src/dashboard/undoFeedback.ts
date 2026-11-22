export interface UndoFeedback {
  momentId: string
  message: string
}

export function getUndoFeedbackMessage(
  feedback: UndoFeedback | null,
  selectedMomentId: string | null,
): string | null {
  if (!feedback || !selectedMomentId || feedback.momentId !== selectedMomentId) return null
  return feedback.message
}
