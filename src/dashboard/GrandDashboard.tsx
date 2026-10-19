import React, { useState, useMemo, useEffect, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './dashboard.css'

import { MomentNode } from './flow/MomentNode'
import { ClusterNode } from './flow/ClusterNode'
import { SessionSeparatorNode } from './flow/SessionSeparatorNode'
import { FilmstripView } from './filmstrip/FilmstripView'
import { CurtainDiff } from './diff/CurtainDiff'
import { Omnibox } from './omnibox/Omnibox'
import { InspectorDrawer } from './inspector/InspectorDrawer'
import { TelemetryBar } from './telemetry/TelemetryBar'
import { FocusTelemetryWidget } from './telemetry/FocusTelemetryWidget'
import { CloseConfirmModal } from './components/CloseConfirmModal'
import { ChromeOnboardingModal } from './components/ChromeOnboardingModal'
import { AboutDeveloperModal } from './components/AboutDeveloperModal'
import { RetentionSettingsModal } from './components/RetentionSettingsModal'
import { audioEngine } from '../audio/synth'
import type { DashboardMoment, DashboardViewMode, TelemetryStats } from './types'
import { useDaemonRpc } from './hooks/useDaemonRpc'
import { resurrectWorkspace } from './hooks/daemonClient'

const initialMockMoments: DashboardMoment[] = [
  {
    id: 'm1',
    timestamp: Date.now() - 1000 * 60 * 35,
    appName: 'Code.exe',
    windowTitle: 'authMiddleware.ts - REWIND (VS Code)',
    processPath: 'C:\\Users\\dev\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe',
    pid: 14208,
    bounds: { x: 100, y: 50, width: 1400, height: 900 },
    gitBranch: 'feat/auth-guard',
    ocrText: 'export async function verifyToken(req: Request) { ... }',
    ocrTokens: [
      { word: 'verifyToken', x: 20, y: 30, width: 80, height: 18 },
      { word: 'req: Request', x: 110, y: 30, width: 90, height: 18 },
      { word: 'JWT_SECRET', x: 210, y: 30, width: 90, height: 18 },
    ],
  },
  {
    id: 'm2',
    timestamp: Date.now() - 1000 * 60 * 25,
    appName: 'WindowsTerminal.exe',
    windowTitle: 'PowerShell - npm test',
    processPath: 'C:\\Program Files\\WindowsApps\\wt.exe',
    pid: 9284,
    bounds: { x: 200, y: 150, width: 1100, height: 700 },
    gitBranch: 'feat/auth-guard',
    ocrText: 'PASS daemon/db/__tests__/timelineDb.test.ts (5 tests)',
    ocrTokens: [
      { word: 'PASS', x: 20, y: 40, width: 40, height: 16 },
      { word: '5 tests', x: 70, y: 40, width: 60, height: 16 },
    ],
  },
  {
    id: 'm3',
    timestamp: Date.now() - 1000 * 60 * 12,
    appName: 'chrome.exe',
    windowTitle: 'http://localhost:5173 - REWIND Grand Dashboard',
    processPath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    pid: 19830,
    bounds: { x: 50, y: 50, width: 1600, height: 950 },
    gitBranch: 'feat/auth-guard',
    domTarget: '#timeline-filter > button.active',
    ocrText: 'Active Session: 35m • Focus Score: 94%',
  },
  {
    id: 'm4',
    timestamp: Date.now() - 1000 * 60 * 2,
    appName: 'Figma.exe',
    windowTitle: 'REWIND v2.0 UI Mockups - Figma',
    processPath: 'C:\\Users\\dev\\AppData\\Local\\Figma\\Figma.exe',
    pid: 24310,
    bounds: { x: 100, y: 80, width: 1500, height: 900 },
    gitBranch: 'main',
    ocrText: 'Linear Dark Mode • Frosted Glassmorphism Theme',
  },
]

export const GrandDashboard: React.FC = () => {
  const [viewMode, setViewMode] = useState<DashboardViewMode>('flow')
  const { isConnected, isLive, needsToken, moments, stats: liveStats, focusReport, pair } = useDaemonRpc(initialMockMoments)
  const [selectedMomentId, setSelectedMomentId] = useState<string>('m3')
  const [isOmniboxOpen, setIsOmniboxOpen] = useState(false)
  const [isSoundMuted, setIsSoundMuted] = useState(audioEngine.isMuted())
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false)
  const [isChromeModalOpen, setIsChromeModalOpen] = useState(false)
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false)
  const [isRetentionModalOpen, setIsRetentionModalOpen] = useState(false)
  const [prunedToast, setPrunedToast] = useState<string | null>(null)
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set())

  const selectedMoment = useMemo(
    () => moments.find((m) => m.id === selectedMomentId) || moments[0] || null,
    [moments, selectedMomentId]
  )

  const previousMoment = useMemo(() => {
    const idx = moments.findIndex((m) => m.id === selectedMomentId)
    if (idx > 0) return moments[idx - 1]
    return moments[0] || null
  }, [moments, selectedMomentId])

  const stats: TelemetryStats = useMemo(
    () =>
      liveStats || {
        focusScore: 94,
        contextSwitchesPerHour: 12,
        activeSessionDurationMinutes: 38,
        walStatus: 'clean',
        momentsRecorded: moments.length,
      },
    [liveStats, moments]
  )

  const nodeTypes = useMemo(
    () => ({
      moment: MomentNode,
      cluster: ClusterNode,
      sessionSeparator: SessionSeparatorNode,
    }),
    []
  )

  const toggleSessionCollapse = useCallback((sessionId: string) => {
    setCollapsedSessions((prev) => {
      const next = new Set(prev)
      if (next.has(sessionId)) next.delete(sessionId)
      else next.add(sessionId)
      return next
    })
  }, [])

  // Desktop Shell IPC Listeners (Close dialog, Pruned notification)
  useEffect(() => {
    const studio = (window as unknown as {
      rewindStudio?: {
        onShowCloseDialog?: (cb: () => void) => () => void
        onPrunedNotification?: (cb: (count: number) => void) => () => void
      }
    }).rewindStudio

    if (studio?.onShowCloseDialog) {
      const unbind = studio.onShowCloseDialog(() => {
        setIsCloseModalOpen(true)
      })
      return unbind
    }
  }, [])

  useEffect(() => {
    const studio = (window as unknown as {
      rewindStudio?: {
        onPrunedNotification?: (cb: (count: number) => void) => () => void
      }
    }).rewindStudio

    if (studio?.onPrunedNotification) {
      const unbind = studio.onPrunedNotification((count: number) => {
        setPrunedToast(`Cleaned up ${count} old moments to preserve disk space`)
        setTimeout(() => setPrunedToast(null), 5000)
      })
      return unbind
    }
  }, [])

  const handleCloseConfirm = useCallback((action: 'minimize' | 'exit', remember: boolean) => {
    setIsCloseModalOpen(false)
    const studio = (window as unknown as {
      rewindStudio?: {
        sendCloseChoice?: (choice: { action: 'minimize' | 'exit'; remember: boolean }) => void
      }
    }).rewindStudio

    if (studio?.sendCloseChoice) {
      studio.sendCloseChoice({ action, remember })
    }
  }, [])

  // Generate XYFlow nodes & edges from moments with collapsible session boundaries
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodesList: Node[] = []
    const edgesList: Edge[] = []
    let currentX = 80
    let lastMomentId: string | null = null

    // Detect session breaks (> 40 minutes between moments)
    const sessions: Array<{ id: string; label: string; moments: DashboardMoment[] }> = []
    let currentSessionMoments: DashboardMoment[] = []
    let currentSessionStart = moments[0]?.timestamp || 0

    moments.forEach((m, idx) => {
      if (idx > 0) {
        const prev = moments[idx - 1]
        const gap = Math.abs(prev.timestamp - m.timestamp)
        if (gap > 40 * 60 * 1000) {
          sessions.push({
            id: `session-${currentSessionStart}`,
            label: `Previous Session · ${new Date(currentSessionStart).toLocaleDateString([], { month: 'short', day: 'numeric' })} ${new Date(currentSessionStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
            moments: currentSessionMoments,
          })
          currentSessionMoments = []
          currentSessionStart = m.timestamp
        }
      }
      currentSessionMoments.push(m)
    })
    if (currentSessionMoments.length > 0) {
      sessions.push({
        id: `session-${currentSessionStart}`,
        label: `Current Session · ${new Date(currentSessionStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
        moments: currentSessionMoments,
      })
    }

    sessions.forEach((sess, sIdx) => {
      if (sIdx > 0) {
        const isCollapsed = collapsedSessions.has(sess.id)
        const sepNodeId = `sep-${sess.id}`
        nodesList.push({
          id: sepNodeId,
          type: 'sessionSeparator',
          position: { x: currentX, y: 150 },
          data: {
            sessionId: sess.id,
            label: sess.label,
            timestamp: sess.moments[0]?.timestamp || 0,
            momentCount: sess.moments.length,
            isCollapsed,
            onToggleCollapse: toggleSessionCollapse,
          },
        })

        if (lastMomentId) {
          edgesList.push({
            id: `e-${lastMomentId}-${sepNodeId}`,
            source: lastMomentId,
            target: sepNodeId,
            animated: true,
            style: { stroke: '#00f0ff', strokeWidth: 1.5, strokeDasharray: '4 4' },
          })
        }
        lastMomentId = sepNodeId
        currentX += 340

        if (isCollapsed) {
          return // Skip descendant moment nodes when collapsed!
        }
      }

      sess.moments.forEach((moment, mIdx) => {
        nodesList.push({
          id: moment.id,
          type: 'moment',
          position: { x: currentX, y: 120 + (mIdx % 2) * 80 },
          data: {
            moment,
            isSelected: moment.id === selectedMomentId,
            onSelect: (m: DashboardMoment) => {
              setSelectedMomentId(m.id)
              audioEngine.playTick(1.1)
            },
            onJump: (m: DashboardMoment) => {
              setSelectedMomentId(m.id)
              audioEngine.playWhoosh()
            },
          },
        })

        if (lastMomentId) {
          edgesList.push({
            id: `e-${lastMomentId}-${moment.id}`,
            source: lastMomentId,
            target: moment.id,
            animated: true,
            style: { stroke: '#00f0ff', strokeWidth: 2 },
          })
        }
        lastMomentId = moment.id
        currentX += 300
      })
    })

    return { initialNodes: nodesList, initialEdges: edgesList }
  }, [moments, selectedMomentId, collapsedSessions, toggleSessionCollapse])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Keep nodes & edges updated when moments change
  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

  // Synchronize selection state across nodes
  useEffect(() => {
    setNodes((prevNodes) =>
      prevNodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          isSelected: node.id === selectedMomentId,
        },
      }))
    )
  }, [selectedMomentId, setNodes])

  // Listen for global Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setIsOmniboxOpen((prev) => !prev)
        audioEngine.playTick(1.4)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleToggleSound = useCallback(() => {
    const muted = audioEngine.toggleMute()
    setIsSoundMuted(muted)
  }, [])

  const handleSelectMoment = useCallback((moment: DashboardMoment) => {
    setSelectedMomentId(moment.id)
  }, [])

  const handleJumpMoment = useCallback((moment: DashboardMoment) => {
    setSelectedMomentId(moment.id)
    audioEngine.playWhoosh()
  }, [])

  return (
    <div className="grand-dashboard">
      {/* Top Header Bar */}
      <header className="gd-header">
        <div className="gd-brand">
          <div className="gd-logo-mark">R</div>
          <div className="gd-title-group">
            <span className="gd-title">REWIND STUDIO</span>
            <span className="gd-subtitle">Time Machine & Activity Intelligence</span>
          </div>
          <span
            style={{
              marginLeft: '12px',
              fontSize: '11px',
              fontWeight: 600,
              padding: '3px 8px',
              borderRadius: '999px',
              border: `1px solid ${isConnected ? 'rgba(0, 240, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)'}`,
              background: isConnected ? 'rgba(0, 240, 255, 0.1)' : 'rgba(255, 255, 255, 0.05)',
              color: isConnected ? '#00f0ff' : '#8899aa',
            }}
          >
            {isConnected ? '● LIVE DAEMON' : '○ DEMO MODE'}
          </span>
          {isConnected && needsToken && (
            <button
              className="gd-nav-btn"
              style={{ marginLeft: 8 }}
              title="Run `rewind token` in a terminal and paste the result"
              onClick={() => {
                const token = window.prompt('Paste the daemon token (run: rewind token)')
                if (token && token.trim()) pair(token)
              }}
            >
              🔑 Pair with daemon
            </button>
          )}
        </div>

        {/* View Switcher Pills */}
        <div className="gd-nav-pills">
          <button
            className={`gd-nav-btn ${viewMode === 'flow' ? 'active' : ''}`}
            onClick={() => {
              setViewMode('flow')
              audioEngine.playTick()
            }}
          >
            <span>☍</span> Node Graph
          </button>
          <button
            className={`gd-nav-btn ${viewMode === 'filmstrip' ? 'active' : ''}`}
            onClick={() => {
              setViewMode('filmstrip')
              audioEngine.playTick()
            }}
          >
            <span>▤</span> Filmstrip
          </button>
          <button
            className={`gd-nav-btn ${viewMode === 'diff' ? 'active' : ''}`}
            onClick={() => {
              setViewMode('diff')
              audioEngine.playTick()
            }}
          >
            <span>⮂</span> Curtain Diff
          </button>
          <button
            className={`gd-nav-btn ${viewMode === 'telemetry' ? 'active' : ''}`}
            onClick={() => {
              setViewMode('telemetry')
              audioEngine.playTick()
            }}
          >
            <span>📊</span> Analytics
          </button>
        </div>

        {/* Header Quick Controls */}
        <div className="gd-actions">
          <button
            className="rewind-btn"
            onClick={() => setIsChromeModalOpen(true)}
            title="Connect Chrome Extension for browser interaction recording"
          >
            🌐 Connect Chrome
          </button>

          <button
            className="rewind-btn"
            onClick={() => {
              const studio = (window as unknown as { rewindStudio?: { toggleHud?: () => void } }).rewindStudio
              if (studio?.toggleHud) studio.toggleHud()
            }}
            title="Toggle Floating HUD Pill (Ctrl+Alt+Z)"
          >
            ⚡ HUD
          </button>

          <button
            className="rewind-btn"
            onClick={() => setIsRetentionModalOpen(true)}
            title="Configure Timeline Retention & Sweep Storage"
          >
            🧹 Retention
          </button>

          <button
            className="rewind-btn"
            onClick={() => {
              setIsOmniboxOpen(true)
              audioEngine.playTick(1.2)
            }}
            title="Search moments or run actions (Ctrl+K)"
          >
            🔍 Search <kbd style={{ fontSize: '0.7rem', opacity: 0.7 }}>Ctrl+K</kbd>
          </button>

          <button
            className="rewind-btn"
            onClick={handleToggleSound}
            title={isSoundMuted ? 'Unmute procedural sound synth' : 'Mute procedural sound synth'}
          >
            {isSoundMuted ? '🔇' : '🔊'}
          </button>

          <button
            className="rewind-btn rewind-btn-primary"
            onClick={() => {
              audioEngine.playWhoosh()
              if (selectedMoment) handleJumpMoment(selectedMoment)
            }}
          >
            ↶ Universal Undo
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="gd-workspace">
        <div className="gd-canvas-container">
          {viewMode === 'flow' && (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              onlyRenderVisibleElements={true}
              fitView
            >
              <Background color="#00f0ff" gap={24} size={1} />
              <Controls style={{ background: 'rgba(15,21,34,0.9)', borderColor: 'rgba(255,255,255,0.1)' }} />
              <MiniMap
                nodeColor="#00f0ff"
                style={{ background: 'rgba(10,14,23,0.9)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </ReactFlow>
          )}

          {viewMode === 'filmstrip' && (
            <FilmstripView
              moments={moments}
              selectedMomentId={selectedMomentId}
              onSelectMoment={handleSelectMoment}
              onJumpMoment={handleJumpMoment}
            />
          )}

          {viewMode === 'diff' && previousMoment && selectedMoment && (
            <CurtainDiff momentBefore={previousMoment} momentAfter={selectedMoment} />
          )}

          {viewMode === 'telemetry' && (
            <FocusTelemetryWidget report={focusReport} />
          )}
        </div>

        {/* Deep Moment Inspector Drawer */}
        <InspectorDrawer
          moment={selectedMoment}
          onJump={handleJumpMoment}
          onResurrect={isLive ? (m, dryRun) => resurrectWorkspace(m.id, dryRun) : undefined}
        />
      </div>

      {/* Bottom Telemetry Bar */}
      <TelemetryBar stats={stats} />

      {/* Floating Developer Badge (Opens About Rohan Gupta modal) */}
      <button
        onClick={() => setIsAboutModalOpen(true)}
        className="rewind-btn"
        style={{
          position: 'fixed',
          bottom: 12,
          right: 14,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 10px',
          background: 'rgba(15, 23, 42, 0.92)',
          border: '1px solid rgba(163, 230, 53, 0.4)',
          borderRadius: '999px',
          color: '#a3e635',
          fontSize: '11px',
          fontWeight: 700,
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.5), 0 0 10px rgba(163, 230, 53, 0.2)',
          cursor: 'pointer',
        }}
        title="About Developer: Rohan Gupta (Click for Bio & Links)"
      >
        <span>👤</span>
        <span>About · Rohan Gupta</span>
      </button>

      {/* Retention Sweeper Toast Notification */}
      {prunedToast && (
        <div
          style={{
            position: 'fixed',
            top: 60,
            right: 20,
            zIndex: 9998,
            background: 'rgba(15, 23, 42, 0.95)',
            border: '1px solid #00f0ff',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6), 0 0 15px rgba(0, 240, 255, 0.2)',
            borderRadius: '10px',
            padding: '10px 16px',
            fontSize: '12px',
            color: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <span>🧹</span>
          <span>{prunedToast}</span>
        </div>
      )}

      {/* Raycast-Style Omnibox Modal */}
      <Omnibox
        isOpen={isOmniboxOpen}
        moments={moments}
        onClose={() => setIsOmniboxOpen(false)}
        onSelectMoment={handleSelectMoment}
        onToggleSound={handleToggleSound}
      />

      {/* Close Confirmation Modal */}
      <CloseConfirmModal
        isOpen={isCloseModalOpen}
        onClose={() => setIsCloseModalOpen(false)}
        onConfirm={handleCloseConfirm}
      />

      {/* Chrome Extension Onboarding Modal */}
      <ChromeOnboardingModal
        isOpen={isChromeModalOpen}
        onClose={() => setIsChromeModalOpen(false)}
      />

      {/* About Developer Modal */}
      <AboutDeveloperModal
        isOpen={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
      />

      {/* Retention Settings Modal */}
      <RetentionSettingsModal
        isOpen={isRetentionModalOpen}
        onClose={() => setIsRetentionModalOpen(false)}
        onPruned={(count) => setPrunedToast(`Retention sweep: ${count} old moments pruned.`)}
      />
    </div>
  )
}
