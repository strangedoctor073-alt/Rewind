import React, { useState } from 'react'

interface ChromeOnboardingModalProps {
  isOpen: boolean
  onClose: () => void
}

export const ChromeOnboardingModal: React.FC<ChromeOnboardingModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  // Safely retrieve extension path from preload or fallback
  const extensionPath =
    typeof window !== 'undefined' && (window as unknown as { rewindStudio?: { getExtensionPath?: () => string } }).rewindStudio?.getExtensionPath?.() ||
    'E:\\Git hub projects\\REWIND\\extension'

  const handleCopyPath = () => {
    navigator.clipboard.writeText(extensionPath)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleOpenExtensionsPage = () => {
    const studio = (window as unknown as { rewindStudio?: { openChromeExtensions?: () => void } }).rewindStudio
    if (studio?.openChromeExtensions) {
      studio.openChromeExtensions()
    } else {
      navigator.clipboard.writeText('chrome://extensions')
      alert('Copied "chrome://extensions" to your clipboard. Paste it into your Chrome address bar!')
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 8, 15, 0.78)',
        backdropFilter: 'blur(8px)',
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
          maxWidth: '520px',
          background: 'rgba(15, 23, 42, 0.96)',
          border: '1px solid rgba(0, 240, 255, 0.35)',
          borderRadius: '16px',
          padding: '26px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 35px rgba(0, 240, 255, 0.18)',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #4285f4, #34a853, #fbbc05, #ea4335)',
                display: 'grid',
                placeItems: 'center',
                fontSize: '20px',
                color: '#ffffff',
                boxShadow: '0 0 15px rgba(66, 133, 244, 0.4)',
              }}
            >
              🌐
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700 }}>Connect Chrome Extension</h3>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
                Silent interaction recording & deep DOM element history
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '18px',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Step 1 */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '12px 14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ background: '#00f0ff', color: '#090d16', borderRadius: '50%', width: '18px', height: '18px', display: 'grid', placeItems: 'center', fontSize: '10px', fontWeight: 800 }}>1</span>
              <strong style={{ fontSize: '12.5px' }}>Open Chrome Extensions Manager</strong>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: '11.5px', color: '#94a3b8' }}>
              Enable <strong>Developer mode</strong> in the top-right corner of Chrome.
            </p>
            <button
              className="rewind-btn"
              style={{ fontSize: '11px', padding: '5px 12px' }}
              onClick={handleOpenExtensionsPage}
            >
              🚀 Open chrome://extensions
            </button>
          </div>

          {/* Step 2 */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '12px 14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ background: '#00f0ff', color: '#090d16', borderRadius: '50%', width: '18px', height: '18px', display: 'grid', placeItems: 'center', fontSize: '10px', fontWeight: 800 }}>2</span>
              <strong style={{ fontSize: '12.5px' }}>Load Unpacked Extension Folder</strong>
            </div>
            <p style={{ margin: '0 0 8px', fontSize: '11.5px', color: '#94a3b8' }}>
              Click <strong>"Load unpacked"</strong> and select this folder:
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                readOnly
                value={extensionPath}
                style={{
                  flex: 1,
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  color: '#e2e8f0',
                  fontFamily: 'monospace',
                }}
              />
              <button
                className="rewind-btn"
                style={{ fontSize: '11px', padding: '6px 12px' }}
                onClick={handleCopyPath}
              >
                {copied ? '✓ Copied' : '📋 Copy'}
              </button>
            </div>
          </div>

          {/* Step 3 */}
          <div
            style={{
              background: 'rgba(163, 230, 53, 0.08)',
              border: '1px solid rgba(163, 230, 53, 0.25)',
              borderRadius: '10px',
              padding: '12px 14px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px' }}>⚡</span>
              <strong style={{ fontSize: '12px', color: '#a3e635' }}>Zero-Touch Sync Enabled</strong>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#cbd5e1', lineHeight: '1.4' }}>
              Once loaded, the extension detects the REWIND daemon on loopback port 48292 and records interactions silently in the background without popups or tabs.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
          <button
            className="rewind-btn rewind-btn-primary"
            style={{ padding: '8px 18px', fontSize: '12.5px' }}
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
