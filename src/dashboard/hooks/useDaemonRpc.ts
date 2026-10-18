/**
 * REWIND Grand Dashboard Daemon RPC Client Hook
 * Talks to the daemon's loopback HTTP bridge (see daemonClient.ts):
 *   1. GET /health decides LIVE vs DEMO mode (no token needed).
 *   2. With a pairing token, pulls real moments via `timeline.getRecent`.
 * Falls back seamlessly to offline fixture state if the daemon is not running.
 */

import { useState, useEffect, useCallback } from 'react'
import type { DashboardMoment, TelemetryStats } from '../types'
import {
  DaemonAuthError,
  callDaemon,
  getStoredToken,
  pingDaemon,
  rowToDashboardMoment,
  setStoredToken,
} from './daemonClient'

export interface DaemonRpcState {
  isConnected: boolean
  isLive: boolean
  /** True when the daemon is up but no (valid) pairing token is stored, so only demo data is shown. */
  needsToken: boolean
  moments: DashboardMoment[]
  stats: TelemetryStats | null
  error: string | null
  refresh: () => void
  pair: (token: string) => void
}

export function useDaemonRpc(fallbackMoments: DashboardMoment[]): DaemonRpcState {
  const [isConnected, setIsConnected] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const [needsToken, setNeedsToken] = useState(false)
  const [moments, setMoments] = useState<DashboardMoment[]>(fallbackMoments)
  const [stats, setStats] = useState<TelemetryStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pollDaemon = useCallback(async () => {
    const up = await pingDaemon()
    setIsConnected(up)
    if (!up) {
      setIsLive(false)
      setNeedsToken(false)
      return
    }

    if (!getStoredToken()) {
      setIsLive(false)
      setNeedsToken(true)
      return
    }

    try {
      const [rows, telemetry] = await Promise.all([
        callDaemon<Record<string, unknown>[]>('timeline.getRecent', { limit: 100 }),
        callDaemon<TelemetryStats>('analytics.telemetryStats').catch(() => null),
      ])
      setNeedsToken(false)
      setError(null)
      if (telemetry) {
        setStats(telemetry)
      }
      if (Array.isArray(rows) && rows.length > 0) {
        // The daemon returns newest first; the dashboard lays moments out oldest to newest.
        setMoments(rows.map(rowToDashboardMoment).sort((a, b) => a.timestamp - b.timestamp))
        setIsLive(true)
      } else {
        setIsLive(false)
      }
    } catch (err) {
      setIsLive(false)
      if (err instanceof DaemonAuthError) {
        setNeedsToken(true)
        setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : 'Daemon request failed')
      }
    }
  }, [])

  const pair = useCallback(
    (token: string) => {
      setStoredToken(token)
      void pollDaemon()
    },
    [pollDaemon],
  )

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      void pollDaemon()
    }, 0)
    const intervalTimer = setInterval(() => {
      void pollDaemon()
    }, 4000)
    return () => {
      clearTimeout(initialTimer)
      clearInterval(intervalTimer)
    }
  }, [pollDaemon])

  return {
    isConnected,
    isLive,
    needsToken,
    moments,
    stats,
    error,
    refresh: pollDaemon,
    pair,
  }
}
