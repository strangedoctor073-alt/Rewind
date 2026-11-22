# REWIND Product Improvement — Implementation Plan

**Mode:** Redesign · Overhaul for Studio IA and design system; targeted repairs for extension and HUD. Preserve the application’s local-first architecture, R icon/wordmark, current data models/storage keys, keyboard shortcuts, and distinct surface purposes.  
**Checkout state:** `main` is two commits ahead of origin; the only untracked file at reassessment was the audit report created in the prior task. Plan is to create a separate local branch before application edits and commit locally only after verification.  
**Guardrail:** No database/schema migration, privacy-default change, broad feature removal, or push is planned.

## Reassessment and implementation decisions

| Priority | Problem verified against current code | Proposed implementation | Likely files | Change type | Risk/dependency | Verification |
|---|---|---|---|---|---|---|
| Critical | `GrandDashboard.tsx` Universal Undo only selects the moment; daemon already implements `timeline.undo`. | Add typed client helper and call the existing method only for a selected real/live moment. Report actual success/reason in UI; rename to “Undo in app” and expose platform/connection/selection constraints instead of promising universal behavior. | `daemonClient.ts`, `GrandDashboard.tsx`, tests for client/action | Frontend + existing backend RPC | Existing RPC uses best-effort app activation + Ctrl+Z and can modify target-app state; never fake success; add explicit action feedback and disabled conditions. | Unit-test request/response mapping; verify fallback/demo cannot trigger; inspect daemon result handling. Windows app-level behavior remains separate hardware verification. |
| High | Node “Jump” and inspector “Resurrect & Jump” only select moments; the inspector already has a genuine `timeline.resurrectWorkspace` Preview/Restore path. | Rename graph action to “Select”; replace redundant bottom pseudo-action with clear selection/navigation feedback or route to the existing real restore action without duplicating it. Keep preview and resurrection outcomes honest. | `MomentNode.tsx`, `InspectorDrawer.tsx`, `GrandDashboard.tsx` | Frontend | Preserve existing keyboard and graph selection behavior; do not imply arbitrary apps can be restored. | Component tests/source-level checks; manually exercise selected moment, dry-run and disconnected states. |
| High | Demo telemetry defaults to plausible numbers; stale moments/stats can remain after daemon loss/empty data. | Remove invented metrics from production view; display explicit sample/demo state only for actual fixture data. Clear/mark stale live values and show last refresh/error state. | `GrandDashboard.tsx`, `useDaemonRpc.ts`, telemetry components/tests | Frontend | Avoid deleting a useful cached timeline silently; distinguish cached/stale from empty. | Hook tests for disconnect, empty dataset, auth failure, request error and recovery. |
| High | Studio opens in a graph, crowded header and multiple floating developer/demo controls; the graph is not the clearest time-first navigation. | Make a chronological timeline the default; offer Graph as an alternative lens. Group moments by day and app, show time/app/title/real evidence availability, search/filter, and an honest empty/demo state. Reduce primary header to status, search, core navigation and grouped secondary actions; preserve AI, retention, browser, graph, diff, HUD and About entrypoints in deliberate locations. | New `TimelineView` component; `GrandDashboard.tsx`, dashboard CSS, `App.tsx`, flow components | Frontend | Large UI refactor; must preserve all working feature access and selected-moment/resurrection contracts. | Build/test; manually verify navigation, search, selection, restore preview and constrained sizes. |
| High | Dashboard typography, spacing and responsive behavior are inconsistent; `dashboard.css` has no responsive breakpoints. | Apply a small shared token system, sans-first UI type, mono only for timestamps/IDs, restrained borders, consistent spacing and responsive header/inspector layouts. Keep R logo; move About out of the floating badge; keep fixture reachable in development but out of the production task path. | `dashboard.css`, `GrandDashboard.tsx`, `App.tsx`, `index.css` | Frontend | Do not replace identity-critical assets or silently remove fixture capability. | CSS self-check at desktop/tablet/narrow viewport dimensions; reduced-motion/focus checks. No GUI automation unless requested; visual runtime may be limited by disabled local browser. |
| Medium | Inspector presents OCR and geometry in a card preview-like region; non-button clickable spans are not keyboard-operable. | Label actual screenshot availability accurately; make OCR/geometry explicitly evidence metadata, use semantic buttons for copy actions, accessible names/live feedback and visible focus. | `MomentNode.tsx`, `InspectorDrawer.tsx`, dashboard CSS | Frontend | Need avoid portraying absent screenshots as images. | Accessibility/source checks and keyboard inspection. |
| Medium | Extension uses fixed three-column layout, its own lime theme, nested delete interaction and polling. | Align color/type/spacing tokens with Studio; fix delete semantics and focus/hover-only access; add narrow-width layout. Replace polling with storage-change subscription only if its current background/message contract supports it cleanly; otherwise retain as a bounded fallback. | `extension-src/src/Timeline.tsx`, `timeline.css`, tests | Frontend | MV3 popup/window contexts differ; avoid breaking extension reload and storage behavior. | Extension build/tests; inspect empty, selected, delete, keyboard and narrow states. |
| Medium | Dashboard polls every four seconds without single-flight protection. | Make polling single-flight with error/staleness state and cleanup; preserve explicit refresh behavior. | `useDaemonRpc.ts`, hook tests | Frontend | Avoid stale closures and overlapping calls. | Fake-timer tests for cadence, overlap prevention, cleanup and reconnect. |
| Low | README/architecture/roadmap language differs on product status and surfaces. | Update only the affected current descriptions after implementation and keep “unverified on Windows” explicit; do not rewrite historical changelog. | `README.md`, `ARCHITECTURE.md`, possibly `ROADMAP.md` | Docs | Avoid falsely claiming native functions passed Windows QA. | Cross-check documented commands/surfaces against actual code. |

## Design record

- **Design Read:** Windows desktop companion for people returning to previous work; visual language: **quiet recovery console**—a calm, time-first activity surface with clear data provenance and restrained mint identity. **Mode:** redesign-overhaul for Studio information architecture, preservation for core behavior and logo.
- **Dials:** visual variance 3/10 (familiar rail/list/workspace), motion 2/10 (state feedback only, reduced-motion aware), information density 7/10 (useful operational metadata grouped progressively), asset dependence 2/10 (real captures only when available), brand fidelity 8/10 (retain R icon, local-first voice and established actions).
- **Palette:** graphite/charcoal backgrounds, layered neutral surfaces and subtle cool-gray borders; primary mint-green accent sampled conceptually from the existing R icon; semantic blue/amber/red only for information/warning/error. No neon glows or decorative gradients.
- **Typography:** platform-native sans stack led by Segoe UI/system UI for headings/body; existing monospace stack only for timestamps, IDs and diagnostics.
- **Spacing:** 4px base, common 8/12/16/24/32px rhythm; 8px control radius, 12px cards, one restrained elevation shadow.
- **Motion:** 120–160ms opacity/color/position transitions; no ambient/hover sound; respect `prefers-reduced-motion`.
- **Highest-risk change:** Making the timeline primary while preserving all existing graph/insights/recovery paths and mode-specific data contracts.
- **Rollback/fallback:** Keep the graph as a selectable alternative and preserve existing API/storage contracts; edits are isolated on a local feature branch and can be reverted without touching user data.

## Implementation sequence

1. Start a local feature branch after confirming the workspace is unchanged apart from the report/plan deliverables; create this plan before source edits.
2. Correct misleading action wiring/labels and honest demo/stale states.
3. Build the timeline-first Studio composition and redesign the inspector/action hierarchy.
4. Align responsive/accessibility behavior and bring extension/HUD tokens into the same visual family without changing capture/privacy defaults.
5. Update only relevant docs; add/update focused tests.
6. Run lint, relevant tests, TypeScript/builds; inspect diff and Git status. Commit the report, plan and approved source changes locally with a descriptive message; do not push.

## Test and acceptance commands

- `npm test`
- `npm run lint`
- `npx tsc -b`
- `npm run build`
- `npm run build:extension`
- `npm run build:daemon`

Any command not run or native Windows behavior not available will be reported as untested; successful Linux CI is not evidence for Windows-native capture, window activation or monitor placement.
