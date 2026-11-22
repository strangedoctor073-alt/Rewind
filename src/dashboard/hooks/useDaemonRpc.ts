import { useState, useEffect, useCallback, useRef } from 'react'
import type { DashboardMoment, FocusReport, TelemetryStats, TimelineDataStatus } from '../types'
import {
  DaemonAuthError,
  callDaemon,
  getStoredToken,
  pingDaemon,
  rowToDashboardMoment,
  setStoredToken,
} from './daemonClient'
import { resolveTimelineDataStatus } from './timelineState'

export interface DaemonRpcState {
  isConnected: boolean
  isLive: boolean
  needsToken: boolean
  dataStatus: TimelineDataStatus
  moments: DashboardMoment[]
  stats: TelemetryStats | null
  focusReport: FocusReport | null
  error: string | null
  refresh: () => void
  pair: (token: string) => void
}

export function useDaemonRpc(fallbackMoments: DashboardMoment[]): DaemonRpcState {
  const [isConnected, setIsConnected] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const [needsToken, setNeedsToken] = useState(false)
  const [dataStatus, setDataStatus] = useState<TimelineDataStatus>('loading')
  const [moments, setMoments] = useState<DashboardMoment[]>([])
  const [stats, setStats] = useState<TelemetryStats | null>(null)
  const [focusReport, setFocusReport] = useState<FocusReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const hasPriorSnapshot = useRef(false)
  const pollInFlight = useRef(false)

  const pollDaemon = useCallback(async () => {
    if (pollInFlight.current) return
    pollInFlight.current = true
    try {
      const up = await pingDaemon()
      setIsConnected(up)
      if (!up) {
        setIsLive(false)
        setNeedsToken(false)
        if (!hasPriorSnapshot.current) setMoments(fallbackMoments)
        setDataStatus(resolveTimelineDataStatus({ daemonAvailable: false, hasToken: false, requestSucceeded: false, momentCount: 0, hadPriorSnapshot: hasPriorSnapshot.current }))
        setError(null)
        return
      }

      if (!getStoredToken()) {
        setIsLive(false)
        setNeedsToken(true)
        if (!hasPriorSnapshot.current) setMoments(fallbackMoments)
        setDataStatus(resolveTimelineDataStatus({ daemonAvailable: true, hasToken: false, requestSucceeded: false, momentCount: 0, hadPriorSnapshot: hasPriorSnapshot.current }))
        return
      }

      try {
        const [rows, telemetry, report] = await Promise.all([
          callDaemon<Record<string, unknown>[]>('timeline.getRecent', { limit: 100 }),
          callDaemon<TelemetryStats>('analytics.telemetryStats').catch(() => null),
          callDaemon<FocusReport>('analytics.focusReport', { limit: 500 }).catch(() => null),
        ])
        setNeedsToken(false)
        setError(null)
        setStats(telemetry)
        setFocusReport(report)
        const liveMoments = Array.isArray(rows) ? rows.map(rowToDashboardMoment).sort((a, b) => a.timestamp - b.timestamp) : []
        setMoments(liveMoments)
        hasPriorSnapshot.current = true
        setIsLive(liveMoments.length > 0)
        setDataStatus(resolveTimelineDataStatus({ daemonAvailable: true, hasToken: true, requestSucceeded: true, momentCount: liveMoments.length, hadPriorSnapshot: hasPriorSnapshot.current }))
      } catch (err) {
        setIsLive(false)
        if (err instanceof DaemonAuthError) {
          setNeedsToken(true)
          setError(err.message)
        } else {
          setError(err instanceof Error ? err.message : 'Daemon request failed')
          if (!hasPriorSnapshot.current) setMoments(fallbackMoments)
        }
        setDataStatus(resolveTimelineDataStatus({ daemonAvailable: true, hasToken: Boolean(getStoredToken()), requestSucceeded: false, momentCount: 0, hadPriorSnapshot: hasPriorSnapshot.current }))
      }
    } finally {
      pollInFlight.current = false
    }
  }, [fallbackMoments])

  const pair = useCallback((token: string) => {
    setStoredToken(token)
    void pollDaemon()
  }, [pollDaemon])

  useEffect(() => {
    const initialTimer = window.setTimeout(() => { void pollDaemon() }, 0)
    const intervalTimer = window.setInterval(() => { void pollDaemon() }, 4000)
    return () => {
      window.clearTimeout(initialTimer)
      window.clearInterval(intervalTimer)
    }
  }, [pollDaemon])

  return {
    isConnected,
    isLive,
    needsToken,
    dataStatus,
    moments,
    stats,
    focusReport,
    error,
    refresh: () => { void pollDaemon() },
    pair,
  }
}
