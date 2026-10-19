import React, { useState } from 'react'

interface CloseConfirmModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: (action: 'minimize' | 'exit', remember: boolean) => void
}

export const CloseConfirmModal: React.FC<CloseConfirmModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const [remember, setRemember] = useState(false)

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 8, 15, 0.75)',
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
          maxWidth: '460px',
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(0, 240, 255, 0.3)',
          borderRadius: '16px',
          padding: '24px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.7), 0 0 30px rgba(0, 240, 255, 0.15)',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '10px',
              background: 'rgba(0, 240, 255, 0.15)',
              border: '1px solid #00f0ff',
              display: 'grid',
              placeItems: 'center',
              fontSize: '18px',
            }}
          >
            ↶
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>Close REWIND Studio</h3>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#94a3b8' }}>
              How would you like to handle closing this window?
            </p>
          </div>
        </div>

        <div
          style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '12px 14px',
            fontSize: '12.5px',
            lineHeight: '1.5',
            color: '#cbd5e1',
          }}
        >
          <strong style={{ color: '#00f0ff' }}>Tip:</strong> Minimizing to the system tray keeps your timeline recording, clipboard history, and <code>Ctrl+Alt+Z</code> HUD active in the background.
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            color: '#94a3b8',
            cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            style={{ accentColor: '#00f0ff', cursor: 'pointer' }}
          />
          Don't ask again (remember my choice)
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
          <button
            className="rewind-btn"
            style={{ padding: '8px 14px', fontSize: '12px' }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="rewind-btn"
            style={{
              padding: '8px 14px',
              fontSize: '12px',
              background: 'rgba(239, 68, 68, 0.15)',
              borderColor: 'rgba(239, 68, 68, 0.4)',
              color: '#fca5a5',
            }}
            onClick={() => onConfirm('exit', remember)}
          >
            Exit Completely
          </button>
          <button
            className="rewind-btn rewind-btn-primary"
            style={{ padding: '8px 16px', fontSize: '12px' }}
            onClick={() => onConfirm('minimize', remember)}
          >
            Minimize to Tray
          </button>
        </div>
      </div>
    </div>
  )
}
