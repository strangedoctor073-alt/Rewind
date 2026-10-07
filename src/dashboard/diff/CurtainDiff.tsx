import React, { useState, useRef } from 'react'
import type { DashboardMoment } from '../types'

interface CurtainDiffProps {
  momentBefore: DashboardMoment
  momentAfter: DashboardMoment
}

export const CurtainDiff: React.FC<CurtainDiffProps> = ({ momentBefore, momentAfter }) => {
  const [sliderPos, setSliderPos] = useState(50) // percentage
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMouseMove = (e: React.MouseEvent) => {
    if (e.buttons !== 1 || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const percent = Math.max(5, Math.min(95, (x / rect.width) * 100))
    setSliderPos(percent)
  }

  return (
    <div className="curtain-diff-container">
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#fff' }}>Interactive Visual Curtain Diff</h2>
        <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
          Drag the cyan slider horizontally to compare UI frames and state between timestamps.
        </p>
      </div>

      <div
        ref={containerRef}
        className="diff-stage"
        onMouseMove={handleMouseMove}
        style={{ cursor: 'ew-resize' }}
      >
        {/* Right Frame (After) */}
        <div className="diff-frame diff-after">
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#a5b4fc', fontSize: '0.8rem', fontWeight: 700 }}>
            <span>MOMENT B (CURRENT)</span>
            <span>{new Date(momentAfter.timestamp).toLocaleTimeString()}</span>
          </div>
          <h3 style={{ color: '#fff', fontSize: '1.1rem', margin: '14px 0 6px 0' }}>{momentAfter.windowTitle}</h3>
          <span style={{ fontSize: '0.8rem', color: '#818cf8', marginBottom: 12 }}>{momentAfter.appName}</span>

          <div style={{ background: 'rgba(0,0,0,0.4)', padding: 12, borderRadius: 8, fontSize: '0.8rem', color: '#cbd5e1' }}>
            <p><strong>Geometry:</strong> {momentAfter.bounds?.width} × {momentAfter.bounds?.height}</p>
            <p><strong>OCR Tokens:</strong> {momentAfter.ocrText || 'None'}</p>
            {momentAfter.gitBranch && <p><strong>Git Branch:</strong> {momentAfter.gitBranch}</p>}
          </div>
        </div>

        {/* Left Frame (Before) clipped to slider position */}
        <div
          className="diff-frame diff-before"
          style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', color: '#38bdf8', fontSize: '0.8rem', fontWeight: 700 }}>
            <span>MOMENT A (PREVIOUS)</span>
            <span>{new Date(momentBefore.timestamp).toLocaleTimeString()}</span>
          </div>
          <h3 style={{ color: '#fff', fontSize: '1.1rem', margin: '14px 0 6px 0' }}>{momentBefore.windowTitle}</h3>
          <span style={{ fontSize: '0.8rem', color: '#38bdf8', marginBottom: 12 }}>{momentBefore.appName}</span>

          <div style={{ background: 'rgba(0,0,0,0.4)', padding: 12, borderRadius: 8, fontSize: '0.8rem', color: '#cbd5e1' }}>
            <p><strong>Geometry:</strong> {momentBefore.bounds?.width} × {momentBefore.bounds?.height}</p>
            <p><strong>OCR Tokens:</strong> {momentBefore.ocrText || 'None'}</p>
            {momentBefore.gitBranch && <p><strong>Git Branch:</strong> {momentBefore.gitBranch}</p>}
          </div>
        </div>

        {/* Draggable Divider Slider */}
        <div className="curtain-slider" style={{ left: `${sliderPos}%` }}>
          <div className="curtain-handle">⮂</div>
        </div>
      </div>
    </div>
  )
}
