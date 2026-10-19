import React, { useEffect, useState } from 'react'

interface AboutDeveloperModalProps {
  isOpen: boolean
  onClose: () => void
}

/** Small hook: types out a string character by character */
function useTypingEffect(text: string, active: boolean, speed = 28): string {
  const [charCount, setCharCount] = useState(0)

  useEffect(() => {
    if (!active) {
      return
    }

    const id = setInterval(() => {
      setCharCount((prev) => {
        if (prev < text.length) return prev + 1
        clearInterval(id)
        return prev
      })
    }, speed)

    return () => {
      clearInterval(id)
      setCharCount(0)
    }
  }, [text, active, speed])

  return active ? text.slice(0, charCount) : ''
}

/** Glowing neon divider */
const Divider = () => (
  <div
    style={{
      height: '1px',
      background: 'linear-gradient(90deg, transparent, rgba(163,230,53,0.35), rgba(0,240,255,0.25), transparent)',
      margin: '0',
    }}
  />
)

/** Single stat pill */
const StatPill: React.FC<{ label: string; value: string; color?: string }> = ({
  label,
  value,
  color = '#a3e635',
}) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '3px',
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${color}33`,
      borderRadius: '10px',
      padding: '10px 16px',
      minWidth: '80px',
    }}
  >
    <span style={{ fontSize: '18px', fontWeight: 800, color }}>{value}</span>
    <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '1px', color: '#64748b', textTransform: 'uppercase' }}>
      {label}
    </span>
  </div>
)

/** Social link button */
const SocialButton: React.FC<{
  href: string
  icon: string
  label: string
  handle: string
  accent: string
  bg: string
}> = ({ href, icon, label, handle, accent, bg }) => {
  const handleClick = () => {
    window.open(href, '_blank', 'noopener,noreferrer')
  }
  return (
    <button
      onClick={handleClick}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 14px',
        background: bg,
        border: `1px solid ${accent}55`,
        borderRadius: '12px',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s ease',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.borderColor = accent
        ;(e.currentTarget as HTMLButtonElement).style.boxShadow = `0 0 14px ${accent}33`
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLButtonElement).style.borderColor = `${accent}55`
        ;(e.currentTarget as HTMLButtonElement).style.boxShadow = 'none'
      }}
    >
      <span style={{ fontSize: '20px', lineHeight: 1 }}>{icon}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
        <span style={{ fontSize: '10px', fontWeight: 700, color: accent, letterSpacing: '0.5px' }}>
          {label}
        </span>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0' }}>{handle}</span>
      </div>
      <span style={{ marginLeft: 'auto', fontSize: '12px', color: '#475569' }}>↗</span>
    </button>
  )
}

export const AboutDeveloperModal: React.FC<AboutDeveloperModalProps> = ({ isOpen, onClose }) => {
  const quote =
    '"I kept losing work — one Ctrl+Z too many, one crash at the worst moment. I wanted a time machine for my entire desktop. REWIND is that machine."'
  const typedQuote = useTypingEffect(quote, isOpen, 24)

  // Trap focus / keyboard dismiss
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    /* Backdrop */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="About Rohan Gupta — REWIND creator"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(3, 6, 14, 0.82)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        animation: 'aboutBackdropIn 0.25s ease forwards',
      }}
      onClick={onClose}
    >
      <style>{`
        @keyframes aboutBackdropIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes aboutCardIn {
          from { opacity: 0; transform: scale(0.93) translateY(16px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes avatarPing {
          0%   { transform: scale(1); opacity: 0.55; }
          70%  { transform: scale(1.28); opacity: 0; }
          100% { transform: scale(1.28); opacity: 0; }
        }
        @keyframes glowOrb {
          0%   { opacity: 0.6; transform: translateX(-50%) scale(0.85); }
          100% { opacity: 1;   transform: translateX(-50%) scale(1.1); }
        }
        @keyframes badgePulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(163,230,53,0.4); }
          50%       { box-shadow: 0 0 0 6px rgba(163,230,53,0); }
        }
      `}</style>

      {/* Modal card */}
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          background: 'rgba(10, 15, 28, 0.97)',
          border: '1px solid rgba(163, 230, 53, 0.28)',
          borderRadius: '22px',
          boxShadow: '0 30px 80px rgba(0,0,0,0.8), 0 0 50px rgba(163,230,53,0.12)',
          color: '#f8fafc',
          overflow: 'hidden',
          animation: 'aboutCardIn 0.3s cubic-bezier(0.16,1,0.3,1) forwards',
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Glow orb ── */}
        <div
          style={{
            position: 'absolute',
            top: '-60px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '320px',
            height: '180px',
            background: 'radial-gradient(ellipse, rgba(163,230,53,0.18) 0%, rgba(0,240,255,0.09) 50%, transparent 75%)',
            filter: 'blur(40px)',
            pointerEvents: 'none',
            animation: 'glowOrb 3s ease-in-out infinite alternate',
          }}
        />

        {/* ── Hero header ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            padding: '24px 24px 20px',
            position: 'relative',
            zIndex: 1,
          }}
        >
          {/* Avatar */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            {/* Ping ring */}
            <div
              style={{
                position: 'absolute',
                inset: '-6px',
                borderRadius: '20px',
                border: '2px solid rgba(163,230,53,0.5)',
                animation: 'avatarPing 2.2s ease-out 0.5s infinite',
              }}
            />
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '18px',
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                border: '2px solid #a3e635',
                boxShadow: '0 0 24px rgba(163,230,53,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Cyberpunk avatar SVG */}
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="24" cy="18" r="9" fill="#a3e635" fillOpacity="0.9" />
                <path
                  d="M8 42C8 33.163 14.715 26 23 26H25C33.284 26 40 33.163 40 42V44H8V42Z"
                  fill="#00f0ff"
                  fillOpacity="0.85"
                />
                {/* Visor accent */}
                <rect x="14" y="14" width="20" height="4" rx="2" fill="#05080e" fillOpacity="0.4" />
                {/* Circuit lines */}
                <path d="M4 24 H14 M34 24 H44" stroke="#a3e635" strokeWidth="0.8" strokeOpacity="0.5" />
                <circle cx="24" cy="24" r="22" stroke="#a3e635" strokeWidth="1" strokeDasharray="5 5" strokeOpacity="0.3" />
              </svg>
            </div>
          </div>

          {/* Name + role */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 800, letterSpacing: '0.3px' }}>
                Rohan Gupta
              </h2>
              <span
                style={{
                  background: 'rgba(163,230,53,0.15)',
                  border: '1px solid rgba(163,230,53,0.45)',
                  color: '#a3e635',
                  fontSize: '9px',
                  fontWeight: 800,
                  padding: '3px 8px',
                  borderRadius: '999px',
                  letterSpacing: '1px',
                  animation: 'badgePulse 2.5s ease-in-out infinite',
                }}
              >
                CREATOR
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8', letterSpacing: '0.3px' }}>
              Software Developer &amp; Systems Architect
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#475569' }}>
              📍 Building REWIND · Local-first productivity tooling
            </p>
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              alignSelf: 'flex-start',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              color: '#94a3b8',
              fontSize: '14px',
              cursor: 'pointer',
              padding: '5px 9px',
              lineHeight: 1,
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.15)'; ;(e.currentTarget as HTMLButtonElement).style.color = '#f87171' }}
            onMouseLeave={(e) => { ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'; ;(e.currentTarget as HTMLButtonElement).style.color = '#94a3b8' }}
          >
            ✕
          </button>
        </div>

        <Divider />

        {/* ── Stats row ── */}
        <div style={{ display: 'flex', gap: '10px', padding: '16px 24px', justifyContent: 'center' }}>
          <StatPill label="Version" value="v6.0" color="#a3e635" />
          <StatPill label="Architecture" value="v5+" color="#00f0ff" />
          <StatPill label="Platform" value="Win" color="#818cf8" />
          <StatPill label="Runtime" value="Electron" color="#f59e0b" />
        </div>

        <Divider />

        {/* ── Bio ── */}
        <div style={{ padding: '18px 24px 0' }}>
          <div
            style={{
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: '12px',
              padding: '14px 16px',
              fontSize: '12.5px',
              lineHeight: '1.65',
              color: '#cbd5e1',
            }}
          >
            Rohan Gupta is a software developer passionate about local-first productivity tooling and building systems that make digital work more recoverable and human.{' '}
            <strong style={{ color: '#e2e8f0' }}>REWIND</strong> is his flagship project — a universal undo machine for the modern Windows desktop, built for power users who refuse to lose their work.
          </div>
        </div>

        {/* ── Typing quote ── */}
        <div style={{ padding: '12px 24px 0' }}>
          <div
            style={{
              background: 'rgba(0,240,255,0.04)',
              border: '1px solid rgba(0,240,255,0.18)',
              borderRadius: '12px',
              padding: '14px 16px',
              position: 'relative',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <span style={{ fontSize: '12px' }}>💡</span>
              <strong style={{ color: '#00f0ff', fontSize: '11px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Why I Built REWIND
              </strong>
            </div>
            <p
              style={{
                margin: 0,
                fontStyle: 'italic',
                fontSize: '12px',
                lineHeight: '1.65',
                color: '#e2e8f0',
                opacity: 0.9,
                minHeight: '54px',
              }}
            >
              {typedQuote}
              {typedQuote.length < quote.length && (
                <span
                  style={{
                    display: 'inline-block',
                    width: '1px',
                    height: '13px',
                    background: '#a3e635',
                    marginLeft: '1px',
                    verticalAlign: 'middle',
                    animation: 'badgePulse 0.8s ease-in-out infinite',
                  }}
                />
              )}
            </p>
          </div>
        </div>

        {/* ── Social links ── */}
        <div style={{ padding: '12px 24px 0', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <SocialButton
            href="https://github.com/strangedoctor073-alt"
            icon="🐙"
            label="GitHub"
            handle="strangedoctor073-alt"
            accent="#e2e8f0"
            bg="rgba(255,255,255,0.04)"
          />
          <SocialButton
            href="https://www.instagram.com/rohangupta_8892/"
            icon="📸"
            label="Instagram"
            handle="@rohangupta_8892"
            accent="#f472b6"
            bg="linear-gradient(135deg, rgba(225,48,108,0.07), rgba(131,58,180,0.07))"
          />
        </div>

        {/* ── Footer ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 24px',
            marginTop: '12px',
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <span style={{ fontSize: '10.5px', color: '#475569' }}>
            REWIND v6.0 · Made with ❤️ in India · Local-first, privacy-first
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(163,230,53,0.1)',
              border: '1px solid rgba(163,230,53,0.35)',
              borderRadius: '8px',
              color: '#a3e635',
              fontSize: '11px',
              fontWeight: 600,
              padding: '5px 14px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
            onMouseEnter={(e) => { ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(163,230,53,0.2)' }}
            onMouseLeave={(e) => { ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(163,230,53,0.1)' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
