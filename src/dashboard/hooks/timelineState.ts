import type { TimelineDataStatus } from '../types'

export interface TimelineStateSignal {
  daemonAvailable: boolean
  hasToken: boolean
  requestSucceeded: boolean
  momentCount: number
  hadPriorSnapshot: boolean
}

/** Use live/empty only for a successful authenticated response; otherwise preserve honest demo/stale provenance. */
export function resolveTimelineDataStatus(signal: TimelineStateSignal): TimelineDataStatus {
  const authoritativeResponse = signal.daemonAvailable && signal.hasToken && signal.requestSucceeded
  if (!authoritativeResponse) return signal.hadPriorSnapshot ? 'stale' : 'demo'
  return signal.momentCount > 0 ? 'live' : 'empty'
}
