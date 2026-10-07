/**
 * REWIND Grand Dashboard Daemon RPC Client Hook
 * Connects to the local daemon (default port 48291) to fetch
 * live timeline moments and telemetry stats.
 * Falls back seamlessly to offline fixture state if daemon is not running.
 */

import { useState, useEffect, useCallback } from 'react'
import type { DashboardMoment, TelemetryStats } from '../types'

export interface DaemonRpcState {
  isConnected: boolean
  isLive: boolean
  moments: DashboardMoment[]
  stats: TelemetryStats | null
  error: string | null
  refresh: () => void
}

export function useDaemonRpc(fallbackMoments: DashboardMoment[]): DaemonRpcState {
  const [isConnected, setIsConnected] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const [moments, setMoments] = useState<DashboardMoment[]>(fallbackMoments)
  const [stats, setStats] = useState<TelemetryStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const pollDaemon = useCallback(async () => {
    try {
      // Check daemon connectivity over HTTP/WS
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 1200)

      const resp = await fetch('http://127.0.0.1:48291/status', {
        signal: controller.signal,
      }).catch(() => null)

      clearTimeout(timeoutId)

      if (resp && resp.ok) {
        const data = await resp.json()
        setIsConnected(true)
        setIsLive(true)
        setError(null)
        if (data.moments && Array.isArray(data.moments) && data.moments.length > 0) {
          setMoments(data.moments)
        }
        if (data.stats) {
          setStats(data.stats)
        }
      } else {
        // Daemon offline — fall back gracefully to offline state
        setIsConnected(false)
        setIsLive(false)
      }
    } catch {
      setIsConnected(false)
      setIsLive(false)
    }
  }, [])

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
    moments,
    stats,
    error,
    refresh: pollDaemon,
  }
}
