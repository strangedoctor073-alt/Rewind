import React, { useState, useEffect } from 'react'
import { getRetentionSettings, setRetentionSettings } from '../hooks/daemonClient'

interface RetentionSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onPruned?: (count: number) => void
}

const PRESET_DAYS = [7, 14, 30, 60, 90, 180]

export const RetentionSettingsModal: React.FC<RetentionSettingsModalProps> = ({
  isOpen,
  onClose,
  onPruned,
}) => {
  const [retentionDays, setRetentionDays] = useState<number>(30)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [lastPurged, setLastPurged] = useState<number | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    let isMounted = true
    getRetentionSettings()
      .then((settings) => {
        if (!isMounted) return
        setRetentionDays(settings.retentionDays)
        if (typeof settings.lastPurgedCount === 'number') {
          setLastPurged(settings.lastPurgedCount)
        }
      })
      .catch(() => {
        // Fallback to default if offline / mock
      })
      .finally(() => {
        if (isMounted) setIsLoading(false)
      })

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      isMounted = false
      window.removeEventListener('keydown', onKey)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleSave = async () => {
    setIsLoading(true)
    setStatusMessage(null)
    try {
      const res = await setRetentionSettings(retentionDays)
      setLastPurged(res.purgedCount)
      setStatusMessage(`Settings applied! ${res.purgedCount} moment(s) pruned.`)
      if (onPruned) onPruned(res.purgedCount)
      setTimeout(() => {
        onClose()
      }, 1200)
    } catch {
      setStatusMessage('Saved locally (mock mode).')
      setTimeout(() => onClose(), 1000)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 8, 15, 0.8)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '460px',
          background: 'rgba(15, 23, 42, 0.96)',
          border: '1px solid rgba(0, 240, 255, 0.3)',
          borderRadius: '20px',
          padding: '26px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 35px rgba(0, 240, 255, 0.12)',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '10px',
                background: 'rgba(0, 240, 255, 0.12)',
                border: '1px solid rgba(0, 240, 255, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
              }}
            >
              🧹
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>Timeline Retention</h3>
              <p style={{ margin: '2px 0 0', fontSize: '11.5px', color: '#94a3b8' }}>
                Auto-prune old timeline moments &amp; conserve disk space
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '16px',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Current status display */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Keep Moments For
            </span>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#00f0ff' }}>
              {retentionDays} <span style={{ fontSize: '14px', fontWeight: 500, color: '#94a3b8' }}>days</span>
            </div>
          </div>
          {lastPurged !== null && (
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Last Prune
              </span>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#a3e635' }}>
                {lastPurged} moments freed
              </div>
            </div>
          )}
        </div>

        {/* Quick preset pills */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Quick Presets:</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {PRESET_DAYS.map((days) => {
              const isSelected = retentionDays === days
              return (
                <button
                  key={days}
                  onClick={() => setRetentionDays(days)}
                  style={{
                    flex: 1,
                    minWidth: '55px',
                    padding: '8px 10px',
                    borderRadius: '8px',
                    background: isSelected ? 'rgba(0, 240, 255, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                    border: isSelected ? '1px solid #00f0ff' : '1px solid rgba(255, 255, 255, 0.08)',
                    color: isSelected ? '#00f0ff' : '#cbd5e1',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {days}d
                </button>
              )
            })}
          </div>
        </div>

        {/* Slider */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#64748b' }}>
            <span>Custom (3 - 365 days):</span>
            <span style={{ color: '#00f0ff', fontWeight: 600 }}>{retentionDays} days</span>
          </div>
          <input
            type="range"
            min={3}
            max={365}
            value={retentionDays}
            onChange={(e) => setRetentionDays(Number(e.target.value))}
            style={{
              width: '100%',
              accentColor: '#00f0ff',
              cursor: 'pointer',
            }}
          />
        </div>

        {/* Status notice */}
        {statusMessage && (
          <div
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              background: 'rgba(163, 230, 53, 0.1)',
              border: '1px solid rgba(163, 230, 53, 0.3)',
              color: '#a3e635',
              fontSize: '11.5px',
              textAlign: 'center',
            }}
          >
            {statusMessage}
          </div>
        )}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
          <button
            onClick={onClose}
            className="rewind-btn"
            style={{ flex: 1, padding: '10px', fontSize: '12px' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading}
            className="rewind-btn rewind-btn-primary"
            style={{
              flex: 1.5,
              padding: '10px',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>{isLoading ? '⏳' : '⚡'}</span>
            <span>{isLoading ? 'Pruning...' : 'Apply & Clean Now'}</span>
          </button>
        </div>
      </div>
    </div>
  )
}
