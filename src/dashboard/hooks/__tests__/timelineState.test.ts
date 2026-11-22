import { describe, expect, it } from 'vitest'
import { resolveTimelineDataStatus } from '../timelineState'

describe('timeline data provenance', () => {
  it('shows demo provenance when no live data has ever loaded and the daemon is down', () => {
    expect(resolveTimelineDataStatus({ daemonAvailable: false, hasToken: false, requestSucceeded: false, momentCount: 0, hadPriorSnapshot: false })).toBe('demo')
  })

  it('keeps the last known data marked stale after a disconnect', () => {
    expect(resolveTimelineDataStatus({ daemonAvailable: false, hasToken: true, requestSucceeded: false, momentCount: 0, hadPriorSnapshot: true })).toBe('stale')
  })

  it('does not call an unauthenticated response live even when a daemon is present', () => {
    expect(resolveTimelineDataStatus({ daemonAvailable: true, hasToken: false, requestSucceeded: false, momentCount: 5, hadPriorSnapshot: false })).toBe('demo')
  })

  it('uses empty only after a successful authenticated response with zero moments', () => {
    expect(resolveTimelineDataStatus({ daemonAvailable: true, hasToken: true, requestSucceeded: true, momentCount: 0, hadPriorSnapshot: false })).toBe('empty')
  })

  it('uses live only after a successful authenticated response with moments', () => {
    expect(resolveTimelineDataStatus({ daemonAvailable: true, hasToken: true, requestSucceeded: true, momentCount: 2, hadPriorSnapshot: false })).toBe('live')
  })

  it('preserves stale provenance after an authenticated request fails', () => {
    expect(resolveTimelineDataStatus({ daemonAvailable: true, hasToken: true, requestSucceeded: false, momentCount: 0, hadPriorSnapshot: true })).toBe('stale')
  })

  it('marks an authenticated empty snapshot stale after a disconnect', () => {
    expect(resolveTimelineDataStatus({ daemonAvailable: false, hasToken: true, requestSucceeded: false, momentCount: 0, hadPriorSnapshot: true })).toBe('stale')
  })
})
