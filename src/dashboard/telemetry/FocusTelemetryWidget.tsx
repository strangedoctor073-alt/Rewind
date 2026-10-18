/**
 * REWIND Focus Telemetry Widget
 *
 * Full analytics panel for the Grand Dashboard "📊 Analytics" view.
 * Renders a Focus Score gauge, app usage bars, 24-hour activity heatmap,
 * and distraction-spike summary — all driven by the daemon's FocusReport.
 *
 * Falls back to a rich demo dataset when the daemon is not connected.
 */
import React, { useMemo } from 'react'
import type { FocusReport, AppCategory } from '../types'

// ── Fallback demo data ────────────────────────────────────────────────────────

const DEMO_REPORT: FocusReport = {
  focusScore: 78,
  contextSwitchesPerHour: 14,
  totalDurationMinutes: 210,
  distractionSpikeCount: 2,
  appBreakdown: [
    { appName: 'Code.exe', durationMs: 5400000, durationMinutes: 90, percentage: 43, category: 'ide' },
    { appName: 'chrome.exe', durationMs: 2700000, durationMinutes: 45, percentage: 21, category: 'browser' },
    { appName: 'WindowsTerminal.exe', durationMs: 2100000, durationMinutes: 35, percentage: 17, category: 'terminal' },
    { appName: 'Slack.exe', durationMs: 1200000, durationMinutes: 20, percentage: 10, category: 'communication' },
    { appName: 'Figma.exe', durationMs: 600000, durationMinutes: 10, percentage: 5, category: 'design' },
  ],
  hourlyHeatmap: Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    focusScore: h >= 9 && h <= 18 ? Math.max(20, 90 - Math.abs(h - 13) * 8) : h >= 19 ? 30 : 0,
    momentCount: h >= 9 && h <= 18 ? 12 + Math.floor(Math.random() * 20) : h >= 19 ? 4 : 0,
  })),
}

// ── Color helpers ─────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<AppCategory, string> = {
  ide: '#00f0ff',
  terminal: '#10b981',
  design: '#f472b6',
  browser: '#f59e0b',
  communication: '#a78bfa',
  utility: '#6b7280',
}

function scoreColor(score: number): string {
  if (score >= 75) return '#10b981'
  if (score >= 50) return '#f59e0b'
  return '#ef4444'
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** SVG circular gauge for the focus score */
function FocusGauge({ score }: { score: number }) {
  const radius = 60
  const stroke = 10
  const cx = 80
  const cy = 80
  const circumference = 2 * Math.PI * radius
  // Only use the top 270° of the circle (135° → 135° + 270°)
  const arc = 270 / 360
  const dasharray = circumference * arc
  const dashoffset = dasharray - (score / 100) * dasharray
  const color = scoreColor(score)

  // Start angle: 135°, going clockwise
  const startAngle = 135 * (Math.PI / 180)
  const x1 = cx + radius * Math.cos(startAngle)
  const y1 = cy + radius * Math.sin(startAngle)

  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <svg width={160} height={160} style={{ overflow: 'visible' }}>
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
          strokeDasharray={`${dasharray} ${circumference - dasharray}`}
          strokeDashoffset={-circumference * (45 / 360)}
          strokeLinecap="round"
          transform={`rotate(135 ${cx} ${cy})`}
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />
        {/* Fill */}
        <circle
          cx={cx} cy={cy} r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${dasharray} ${circumference - dasharray}`}
          strokeDashoffset={dashoffset}
          strokeLinecap="round"
          transform={`rotate(135 ${cx} ${cy})`}
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            filter: `drop-shadow(0 0 6px ${color})`,
            transition: 'stroke-dashoffset 0.6s ease, stroke 0.4s ease',
          }}
        />
        {/* Score text */}
        <text x={cx} y={cy - 6} textAnchor="middle" fill={color} fontSize={28} fontWeight={700} fontFamily="monospace">
          {score}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" fill="rgba(255,255,255,0.5)" fontSize={11}>
          Focus Score
        </text>
        {/* Start dot */}
        <circle cx={x1} cy={y1} r={3} fill="rgba(255,255,255,0.2)" />
      </svg>
    </div>
  )
}

/** Horizontal bar for one app */
function AppBar({ appName, percentage, category }: { appName: string; percentage: number; category: AppCategory }) {
  const color = CATEGORY_COLORS[category]
  const shortName = appName.replace(/\.exe$/i, '')
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
        <span style={{ color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{shortName}</span>
        <span style={{ color, fontWeight: 600, marginLeft: 8 }}>{percentage}%</span>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div
          style={{
            height: '100%',
            width: `${percentage}%`,
            borderRadius: 3,
            background: color,
            boxShadow: `0 0 6px ${color}`,
            transition: 'width 0.5s ease',
          }}
        />
      </div>
    </div>
  )
}

/** 24-cell dot grid heatmap */
function HourlyHeatmap({ buckets }: { buckets: FocusReport['hourlyHeatmap'] }) {
  const sorted = useMemo(() => [...buckets].sort((a, b) => a.hour - b.hour), [buckets])
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 4, marginBottom: 4 }}>
        {sorted.map((b) => {
          const alpha = b.momentCount === 0 ? 0.05 : 0.15 + (b.focusScore / 100) * 0.85
          const color = scoreColor(b.focusScore)
          return (
            <div
              key={b.hour}
              title={`${b.hour}:00 — Focus ${b.focusScore}% (${b.momentCount} moments)`}
              style={{
                width: '100%',
                paddingBottom: '100%',
                borderRadius: 3,
                background: b.momentCount === 0 ? 'rgba(255,255,255,0.04)' : color,
                opacity: alpha,
                transition: 'opacity 0.3s',
                cursor: 'default',
              }}
            />
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
        <span>12 AM</span><span>6 AM</span><span>12 PM</span><span>6 PM</span><span>11 PM</span>
      </div>
    </div>
  )
}

/** One stat card */
function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 10,
      padding: '14px 16px',
      flex: 1,
      minWidth: 110,
    }}>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? '#fff', fontFamily: 'monospace' }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ── Main widget ───────────────────────────────────────────────────────────────

interface FocusTelemetryWidgetProps {
  /** Full focus report from the daemon. Falls back to demo data when null. */
  report: FocusReport | null
}

export const FocusTelemetryWidget: React.FC<FocusTelemetryWidgetProps> = ({ report }) => {
  const data = report ?? DEMO_REPORT
  const isDemo = report === null
  const top5 = data.appBreakdown.slice(0, 5)

  return (
    <div style={{
      height: '100%',
      overflowY: 'auto',
      padding: '24px 28px',
      color: '#e2e8f0',
      fontFamily: '"Inter", "Segoe UI", sans-serif',
      fontSize: 13,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <span style={{ fontSize: 20 }}>📊</span>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>Focus & Productivity Analytics</div>
          <div style={{ fontSize: 11, color: isDemo ? '#f59e0b' : '#10b981', marginTop: 2 }}>
            {isDemo ? '⚠ Demo data — connect daemon for live analytics' : '● Live data from daemon'}
          </div>
        </div>
      </div>

      {/* Top row: gauge + stat cards */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 24, alignItems: 'flex-start' }}>
        {/* Gauge */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: '16px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          minWidth: 180,
        }}>
          <FocusGauge score={data.focusScore} />
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 4, textAlign: 'center' }}>
            {data.focusScore >= 75 ? '🟢 Deep Focus' : data.focusScore >= 50 ? '🟡 Moderate Focus' : '🔴 High Distraction'}
          </div>
        </div>

        {/* Stat cards */}
        <div style={{ display: 'flex', gap: 12, flex: 1, flexWrap: 'wrap', minWidth: 280 }}>
          <StatCard
            label="Context Switches"
            value={data.contextSwitchesPerHour}
            sub="per hour"
            color={data.contextSwitchesPerHour > 20 ? '#ef4444' : '#00f0ff'}
          />
          <StatCard
            label="Session Duration"
            value={`${data.totalDurationMinutes}m`}
            sub="tracked today"
          />
          <StatCard
            label="Distraction Spikes"
            value={data.distractionSpikeCount}
            sub=">5 apps / 2 min"
            color={data.distractionSpikeCount > 0 ? '#f59e0b' : '#10b981'}
          />
        </div>
      </div>

      {/* App breakdown */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        padding: '16px 20px',
        marginBottom: 20,
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
          App Usage Breakdown
        </div>
        {top5.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>No app data recorded yet.</div>
        ) : (
          top5.map((app) => (
            <AppBar key={app.appName} appName={app.appName} percentage={app.percentage} category={app.category} />
          ))
        )}
        {/* Legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginTop: 12 }}>
          {(Object.entries(CATEGORY_COLORS) as [AppCategory, string][]).map(([cat, color]) => (
            <span key={cat} style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color }} />
              {cat}
            </span>
          ))}
        </div>
      </div>

      {/* 24h heatmap */}
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        padding: '16px 20px',
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14 }}>
          24-Hour Activity Heatmap
        </div>
        <HourlyHeatmap buckets={data.hourlyHeatmap} />
        <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#10b981', opacity: 0.8 }} />
            High focus
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#f59e0b', opacity: 0.8 }} />
            Moderate
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: '#ef4444', opacity: 0.8 }} />
            Distracted
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: 'rgba(255,255,255,0.1)' }} />
            Inactive
          </span>
        </div>
      </div>
    </div>
  )
}
