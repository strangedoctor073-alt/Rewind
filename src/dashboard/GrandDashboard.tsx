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
import { StandupModal } from './standup/StandupModal'
import { audioEngine } from '../audio/synth'
import type { DashboardMoment, DashboardViewMode } from './types'
import { useDaemonRpc } from './hooks/useDaemonRpc'
import { resurrectWorkspace, undoInApp } from './hooks/daemonClient'
import { fallbackMoments } from './fixtures/fallbackMoments'
import { TimelineView } from './timeline/TimelineView'

interface RewindStudioApi {
  onShowCloseDialog?: (cb: () => void) => () => void
  onPrunedNotification?: (cb: (count: number) => void) => () => void
  sendCloseChoice?: (choice: { action: 'minimize' | 'exit'; remember: boolean }) => void
  toggleHud?: () => void
}

function getRewindStudio(): RewindStudioApi | undefined {
  return (window as unknown as { rewindStudio?: RewindStudioApi }).rewindStudio
}

export const GrandDashboard: React.FC = () => {
  const [viewMode, setViewMode] = useState<DashboardViewMode>('timeline')
  const { isConnected, isLive, needsToken, dataStatus, moments, stats, focusReport, error, pair } = useDaemonRpc(fallbackMoments)
  const [selectedMomentId, setSelectedMomentId] = useState<string>('m3')
  const [isOmniboxOpen, setIsOmniboxOpen] = useState(false)
  const [isSoundMuted, setIsSoundMuted] = useState(audioEngine.isMuted())
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false)
  const [isChromeModalOpen, setIsChromeModalOpen] = useState(false)
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false)
  const [isRetentionModalOpen, setIsRetentionModalOpen] = useState(false)
  const [isStandupModalOpen, setIsStandupModalOpen] = useState(false)
  const [prunedToast, setPrunedToast] = useState<string | null>(null)
  const [collapsedSessions, setCollapsedSessions] = useState<Set<string>>(new Set())

  const selectedMoment = useMemo(
    () => moments.find((m) => m.id === selectedMomentId) || moments[0] || null,
    [moments, selectedMomentId]
  )

  const previousMoment = useMemo(() => {
    if (!selectedMoment) return null
    const idx = moments.findIndex((m) => m.id === selectedMoment.id)
    return idx > 0 ? moments[idx - 1] : null
  }, [moments, selectedMoment])

  const [isMoreOpen, setIsMoreOpen] = useState(false)
  const [undoBusy, setUndoBusy] = useState(false)
  const [undoFeedback, setUndoFeedback] = useState<{ momentId: string; message: string } | null>(null)

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
    const studio = getRewindStudio()
    if (studio?.onShowCloseDialog) {
      const unbind = studio.onShowCloseDialog(() => {
        setIsCloseModalOpen(true)
      })
      return unbind
    }
  }, [])

  useEffect(() => {
    const studio = getRewindStudio()
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
    const studio = getRewindStudio()
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
            animated: false,
            style: { stroke: 'rgba(105, 213, 165, 0.55)', strokeWidth: 1.5, strokeDasharray: '4 4' },
          })
        }
        lastMomentId = sepNodeId
        currentX += 340

        if (isCollapsed) {
          return // Session is collapsed; skip child moments
        }
      }

      sess.moments.forEach((moment, mIdx) => {
        nodesList.push({
          id: moment.id,
          type: 'moment',
          position: { x: currentX, y: 120 + (mIdx % 2) * 80 },
          data: {
            moment,
            isSelected: moment.id === selectedMoment?.id,
            onSelect: (m: DashboardMoment) => {
              setSelectedMomentId(m.id)
            },
          },
        })

        if (lastMomentId) {
          edgesList.push({
            id: `e-${lastMomentId}-${moment.id}`,
            source: lastMomentId,
            target: moment.id,
            animated: false,
            style: { stroke: 'rgba(105, 213, 165, 0.55)', strokeWidth: 1.5 },
          })
        }
        lastMomentId = moment.id
        currentX += 300
      })
    })

    return { initialNodes: nodesList, initialEdges: edgesList }
  }, [moments, selectedMoment?.id, collapsedSessions, toggleSessionCollapse])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  // Keep nodes & edges updated when moments change
  useEffect(() => {
    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [initialNodes, initialEdges, setNodes, setEdges])

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

  const handleShowInGraph = useCallback((moment: DashboardMoment) => {
    setSelectedMomentId(moment.id)
    setViewMode('flow')
  }, [])

  const handleUndoInApp = useCallback(async (moment: DashboardMoment) => {
    if (!isLive) return
    setUndoBusy(true)
    setUndoFeedback(null)
    try {
      const result = await undoInApp(moment.id)
      setUndoFeedback({
        momentId: moment.id,
        message: result.undone
          ? `Ctrl+Z sent to ${result.targetApp || moment.appName}. The app determines whether it can undo this action.`
          : result.reason || 'No Undo shortcut was sent.',
      })
    } catch (err) {
      setUndoFeedback({ momentId: moment.id, message: err instanceof Error ? err.message : 'Undo request failed; no result was confirmed.' })
    } finally {
      setUndoBusy(false)
    }
  }, [isLive])

  return (
    <div className="grand-dashboard">
      {/* Top Header Bar */}
      <header className="gd-header">
        <div className="gd-header-main">
          <div className="gd-brand">
            <div className="gd-logo-mark">R</div>
            <div className="gd-title-group">
              <span className="gd-title">REWIND</span>
              <span className="gd-subtitle">Private activity timeline</span>
            </div>
            <span className={`gd-connection-status status-${dataStatus}`} aria-live="polite" title={error || undefined}>
              <span aria-hidden="true" />
              {dataStatus === 'live' ? 'LIVE' : dataStatus === 'stale' ? 'OFFLINE · CACHED' : dataStatus === 'loading' ? 'CONNECTING' : dataStatus === 'empty' ? 'NO ACTIVITY' : 'SAMPLE DATA'}
            </span>
            {isConnected && needsToken && (
              <button className="gd-pair-btn" title="Run rewind token in a terminal and paste the result" onClick={() => {
                const token = window.prompt('Paste the daemon token (run: rewind token)')
                if (token && token.trim()) pair(token)
              }}>Connect daemon</button>
            )}
          </div>
          <div className="gd-header-actions">
            <button className="gd-search-trigger" onClick={() => setIsOmniboxOpen(true)} aria-label="Search activity" title="Search moments (Ctrl+K)">
              <span aria-hidden="true">⌕</span><span>Search activity</span><kbd>Ctrl K</kbd>
            </button>
            <details className="gd-more-menu" open={isMoreOpen} onToggle={(event) => setIsMoreOpen((event.currentTarget as HTMLDetailsElement).open)}>
              <summary aria-label="More actions">More</summary>
              <div className="gd-more-popover">
                <button onClick={() => { setIsChromeModalOpen(true); setIsMoreOpen(false) }}>Connect browser recorder</button>
                {getRewindStudio()?.toggleHud && <button onClick={() => { getRewindStudio()?.toggleHud?.(); setIsMoreOpen(false) }}>Toggle desktop HUD</button>}
                <button onClick={() => { setIsRetentionModalOpen(true); setIsMoreOpen(false) }}>Retention settings</button>
                <button onClick={() => { setIsStandupModalOpen(true); setIsMoreOpen(false) }}>Local AI insights</button>
                <button onClick={() => { setIsAboutModalOpen(true); setIsMoreOpen(false) }}>About REWIND</button>
                <button onClick={handleToggleSound}>{isSoundMuted ? 'Enable interface sounds' : 'Mute interface sounds'}</button>
              </div>
            </details>
          </div>
        </div>
        <nav className="gd-nav-pills" aria-label="Activity views">
          <button className={`gd-nav-btn ${viewMode === 'timeline' ? 'active' : ''}`} aria-pressed={viewMode === 'timeline'} onClick={() => setViewMode('timeline')}>Timeline</button>
          <button className={`gd-nav-btn ${viewMode === 'flow' ? 'active' : ''}`} aria-pressed={viewMode === 'flow'} onClick={() => setViewMode('flow')}>Graph</button>
          <button className={`gd-nav-btn ${viewMode === 'filmstrip' ? 'active' : ''}`} aria-pressed={viewMode === 'filmstrip'} onClick={() => setViewMode('filmstrip')}>Filmstrip</button>
          <button className={`gd-nav-btn ${viewMode === 'diff' ? 'active' : ''}`} aria-pressed={viewMode === 'diff'} onClick={() => setViewMode('diff')}>Compare</button>
          <button className={`gd-nav-btn ${viewMode === 'telemetry' ? 'active' : ''}`} aria-pressed={viewMode === 'telemetry'} onClick={() => setViewMode('telemetry')}>Insights</button>
        </nav>
      </header>

      {/* Main Workspace */}
      <div className="gd-workspace">
        <div className="gd-canvas-container">
          {viewMode === 'timeline' && (
            <TimelineView
              moments={moments}
              selectedMomentId={selectedMoment?.id ?? null}
              dataStatus={dataStatus}
              connectionError={error}
              onSelectMoment={handleSelectMoment}
            />
          )}

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
              <Background color="#34443d" gap={28} size={1} />
              <Controls style={{ background: '#171d23', borderColor: '#2b343e' }} />
              <MiniMap
                nodeColor="#69d5a5"
                style={{ background: '#14191f', border: '1px solid #2b343e' }}
              />
            </ReactFlow>
          )}

          {viewMode === 'filmstrip' && (
            <FilmstripView
              moments={moments}
              selectedMomentId={selectedMomentId}
              onSelectMoment={handleSelectMoment}
              onShowInGraph={handleShowInGraph}
            />
          )}

          {viewMode === 'diff' && (previousMoment && selectedMoment
            ? <CurtainDiff momentBefore={previousMoment} momentAfter={selectedMoment} />
            : <section className="compare-empty"><p className="timeline-eyebrow">COMPARE</p><h1>Select a later moment to compare</h1><p>Compare needs two distinct, recorded moments. It won’t create a synthetic before-and-after view.</p></section>)}

          {viewMode === 'telemetry' && (
            <FocusTelemetryWidget report={focusReport} />
          )}
        </div>

        {/* Deep Moment Inspector Drawer */}
        <InspectorDrawer
          moment={selectedMoment}
          onShowInGraph={handleShowInGraph}
          onResurrect={isLive ? (m, dryRun) => resurrectWorkspace(m.id, dryRun) : undefined}
          onUndo={isLive ? handleUndoInApp : undefined}
          undoBusy={undoBusy}
          undoFeedback={undoFeedback?.momentId === selectedMoment?.id ? undoFeedback.message : null}
        />
      </div>

      {/* Bottom Telemetry Bar */}
      <TelemetryBar stats={stats} dataStatus={dataStatus} />

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

      {/* Local AI / Cognitive Standup Modal */}
      <StandupModal
        isOpen={isStandupModalOpen}
        onClose={() => setIsStandupModalOpen(false)}
      />
    </div>
  )
}
