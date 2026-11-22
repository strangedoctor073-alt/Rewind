# REWIND Repository & Product Audit

**Review date:** 2026-10-30  
**Scope:** Read-only source and documentation review of the local `REWIND` checkout. No application code was modified, deleted, committed, or pushed.  
**Checkout:** branch `main`, reported by Git as `ahead 2` of `origin/main`; no pre-existing working-tree changes were shown in the status output.  
**Important limitation:** This is a source-led audit, not a complete runtime/visual QA pass. I inspected product/architecture docs and representative UI, daemon, Electron, extension, storage, security and CI files; I did not launch the app, run builds/tests, inspect every source file, or test real Windows capture/resurrection hardware. Findings below distinguish confirmed source behavior from risks that require runtime verification.

## 1. Executive summary

REWIND is an ambitious local-first Windows activity time machine with several distinct products inside one repository: an Electron HUD, a React “Studio” dashboard, a TypeScript daemon and CLI, a Chromium extension recorder/timeline, and a separate web scrubber fixture. The architecture has meaningful engineering strengths: local SQLite/FTS storage, a typed daemon core, explicit RPC authentication, payload limits, allow-listed Electron IPC, sensitive-window exclusion, encrypted vault support, privacy-conscious extension masking, tests across daemon/desktop/CLI and a GitHub Actions workflow.

The main product problem is not lack of features; it is **coherence and truthfulness**. The repository presents multiple visual identities and multiple overlapping “rewind” concepts. Some interface labels promise stronger operations than their handlers perform, demo fallbacks can resemble real data, and the same product’s docs and UI have not kept pace with implementation. The Grand Dashboard is particularly overloaded: a dense dark neon node canvas shares its header with many unrelated actions, while the principal history view competes with analytics, diff, filmstrip, AI, retention, extension setup and workspace resurrection.

The strongest confirmed product-integrity defect is that the Studio’s **“Universal Undo”** control is wired to select/jump to the current moment, not to execute the daemon’s undo RPC. The dashboard’s “Jump”/“Resurrect & Jump” affordances likewise select moments in the graph rather than actually bringing the target window forward. The separate CLI/daemon paths exist, but the dashboard language makes users expect an operation that this UI path does not perform.

The strongest confirmed UX/data-integrity risks are: indistinguishable live-vs-demo telemetry values in the dashboard; recording actions and reset/delete flows whose failure reporting is inconsistent; no responsive rules in the Grand Dashboard stylesheet; and a high-sensitivity capture product whose privacy promises depend on best-effort title/process classification. The review did **not** confirm several severe defects claimed in an older internal audit note: the current tree has real GDI capture code, a CI workflow, extension event-buffer persistence and retention/pruning, tab-close cleanup, and substantial RPC serialization/auth hardening. That note should not be treated as current evidence.

**Recommended direction:** Design REWIND around the idea of a **private, searchable activity time axis**—not a generic analytics dashboard and not a decorative node graph. Make time, source app, confidence/availability, privacy state and restoration capability explicit. Keep the Studio’s graph/filmstrip/diff as optional lenses over one understandable timeline. Make the product’s advertised capabilities and actual behavior agree before adding more surface area.

## 2. Product and architecture overview

### What it is

The README describes a local-first window-activity timeline, app-level undo hotkey and in-browser interaction recorder. In practice, there are at least four usable surfaces and one explicit demo surface:

| Surface | Code | Role / current behavior |
|---|---|---|
| Electron HUD and desktop time machine | `desktop/main.js`, `desktop/overlay/` | Windows-specific background capture, floating overlay, global shortcut, clipboard/state/checkpoint and undo-oriented actions. |
| Headless daemon and CLI | `daemon/`, `bin/rewind.js` | SQLite timeline, window frame capture, JSON-RPC over named pipe/TCP, authenticated loopback HTTP bridge, search, analytics, vaults, macro export and workspace resurrection. |
| REWIND Studio | `src/dashboard/GrandDashboard.tsx`, `src/dashboard/` | Daemon-backed timeline explorer with demo fallback; graph, filmstrip, diff and analytics views; inspector, omnibox, AI, retention and resurrection controls. |
| Chromium extension | `extension/`, `extension-src/` | MV3 interaction capture for HTTP(S), local browser storage, session history, event inspection, JSON export, and best-effort return to a URL/scroll position. |
| Web scrubber fixture | `src/App.tsx`, `src/App.css`, `src/final.css` | Local browser-only sample recording and playback/editor demo; the app defaults to Studio, but switches to the fixture through an on-screen button. |

### Stack and boundaries

- React 19, TypeScript 6, Vite 8, Vitest 5 and `@xyflow/react` for the web surfaces.
- Electron 44 for Windows desktop shell; Koffi Win32 FFI for native window data/capture and placement.
- Node.js TypeScript daemon, `better-sqlite3` in WAL mode with FTS5, local RPC and CLI.
- Manifest V3 extension using vanilla JS service worker/content script plus a React/TypeScript timeline UI.
- SQLite timeline database at `%LOCALAPPDATA%\\Rewind\\timeline.db`; extension data in `chrome.storage.local`; separate desktop/session/back-up state in app data.
- Browser dashboard connects to `127.0.0.1:48292` HTTP bridge; CLI uses a Windows named pipe; RPC/TCP service is on loopback `127.0.0.1:48291`.

The key architectural challenge is that the user-facing product is spread across independently evolved subsystems and storage models. `ARCHITECTURE.md` calls `src/` a web development fixture, while `README.md` calls it the Grand Dashboard Studio and `src/App.tsx` actually mounts that dashboard by default. The README, architecture guide, roadmap and interface therefore disagree on what is primary and which data source powers each control.

### Main workflows

1. Desktop: run the shell/daemon, record permitted active-window moments, open the HUD, search/jump/restore or export/checkpoint.
2. Studio: pair the dashboard with the local daemon using its token; browse moments and inspect/preview/resurrect a workspace. Without pairing or live moments it displays fallback/demo content.
3. Browser: start and stop recording from the extension popup on an HTTP(S) tab; inspect events in timeline; export or focus/open a matching tab and restore scroll when the content script is available.
4. CLI: start/stop/status/pause/search/undo/resurrect, export macros, or create/restore a vault.
5. Fixture: record interactions on an embedded sample storefront, scrub/replay, undo/redo, save/import local JSON.

## 3. Frontend and UI/UX critique

### Overall visual identity

There are two distinct palettes: Studio/desktop is almost-black/navy with cyan glow, while the extension and fixture use charcoal with acid-lime highlights. The Studio CSS calls itself “Cyber-Minimalist Glassmorphism”; in practice, bright cyan glows, blur panels, gradients, emojis, outlined pills and all-caps labels create a gamer/dev-tool aesthetic. That can work for a native power tool, but it does not currently read as a considered product system. It also clashes with the quieter lime extension UI.

Typography is declared as JetBrains Mono for almost all Studio content (`src/dashboard/dashboard.css`), which makes interface labels, titles and prose feel technical and reduces comfortable scanning. The extension uses a sans-first style with mono only for technical identifiers, which is a more usable division but is not shared. Fonts are named in CSS but no bundled font assets were found in the inspected asset list; the appearance will fall back according to platform availability.

### Grand Dashboard / Studio

**What feels amateurish or dated:** The header attempts to fit brand/status, four navigation pills, six quick actions, a universal undo button, and other controls on one horizontal row (`GrandDashboard.tsx:286-435`). The labeled emoji buttons make the header visually noisy and hard to scan. The floating “About · Rohan Gupta” badge is an always-visible, high-contrast developer promotion on top of the core work surface (`GrandDashboard.tsx:488-514`). The separate floating “Switch to Demo Fixture” button in `App.tsx:283-307` further weakens the production feel.

**Layout and proportions:** The main layout gives the canvas the dominant area and keeps a 320px inspector open (`dashboard.css:167-179, 447-458`). The graph creates horizontal positions by incrementing a fixed X coordinate per moment/session (`GrandDashboard.tsx:130-235`); a long day therefore becomes a very wide canvas that requires pan/zoom and offers little high-level overview. The “time machine” task is temporal, but chronological time is not the primary visible structure. The selected moment inspector is useful but has a crowded, metadata-first hierarchy. Node previews show OCR text or fallback geometry (`MomentNode.tsx:77-85`), not a clear captured screenshot preview, so the graph cards can feel like placeholders even when real moment records are available.

**Navigation and interaction:** Graph, Filmstrip, Curtain Diff and Analytics are peer-level tabs even though three are alternative views of history and one is a report. Search, pairing, HUD, retention, AI, browser setup and undo all compete in the same action area. The product needs clearer primary vs secondary actions and a persistent indication of which subsystem is active (daemon timeline, browser recording, desktop session, or demo fixture).

**States and trust:** The disconnected badge says “DEMO MODE,” but fallback telemetry is populated with a plausible `focusScore: 94`, 12 switches/hour and 38-minute session (`GrandDashboard.tsx:70-80`). Those look like real measurements. Pairing state, empty timeline, permission failure, stale data, disconnected daemon and partial data should each be explicit, not collapsed into generic demo/live labels. `useDaemonRpc.ts` does not clear previously loaded moments/stats when the daemon drops or returns an empty list; stale live data can remain visible while `isLive` becomes false.

**Responsive behavior:** The inspected `dashboard.css` ends at 500 lines with no media queries. The header is an unwrapped flex row; inspector width is fixed; the node cards are fixed-width. Responsive behavior for desktop window resizing, tablet, narrow windows and high-DPI layout is therefore unaddressed in the primary Studio surface. No visual browser or real window QA was performed, so actual breakpoints/failure screenshots remain unverified.

**Accessibility/usability:** `dashboard.css` sets `user-select: none` on the entire dashboard, which impedes selecting/copying technical text and can hurt standard interactions. Visible focus styles, reduced-motion treatment and high-contrast checks are not evident in the reviewed CSS. Numerous icon/emoji controls rely on `title` tooltips; tooltips are not a replacement for accessible names. OCR tokens and DOM targets are clickable `<span>`/`<code>` elements (`InspectorDrawer.tsx:87-130`) instead of keyboard-operable buttons. Graph nodes contain nested controls, and the global key handlers should be audited for event bubbling and focus conflicts. Decorative hover audio plays on node mouse entry (`MomentNode.tsx:28-30`), which can become noisy over dense nodes.

### Chromium extension timeline

The extension is the clearest information architecture of the inspected UIs: searchable session list, event stream with filters, and inspector/actions. It has useful empty states, keyboard navigation, status toast and separate event type badges (`Timeline.tsx`, `timeline.css`). It is visually more restrained and readable than Studio, but it represents a separate brand accent and typographic system. The three-column layout is fixed at 260px / flexible / 320px in inspected CSS (`timeline.css:155-162`); tablet/narrow resizing needs targeted validation. The delete affordance is nested inside a session `<button>` as an element with `role="button"` (`Timeline.tsx:259-275`), which is invalid/ambiguous interactive nesting and should be replaced with sibling buttons or a proper row container. Delete appears only on hover (`timeline.css:261-276`), so keyboard and touch discoverability need verification. Search/detail refresh uses 2-second and 1.5-second polling (`Timeline.tsx:54-92`); a storage change subscription would be less wasteful and more immediate.

### Web fixture

`src/App.css` is compressed into a single long line, and `src/final.css` overlays later fixes, making visual maintenance difficult. The fixture itself is polished enough to demonstrate a storefront timeline, but it is not the actual browser extension recorder or desktop time-machine interface. A top-level mode switch between Studio and fixture makes product boundaries unclear. It should be developer-only or moved to a standalone fixture route/build.

### Page-specific redesign recommendations

| Page/surface | Recommendation |
|---|---|
| Studio overview/timeline | Make a searchable chronological timeline the default, grouped by day/session/app. Keep graph as an optional “Map” view. Use a compact top bar with brand, recording/privacy state, search, and one primary action. |
| Moment detail | Use an inspector with screenshot thumbnail (when genuinely captured), app/title/time, restore confidence, privacy indicators, and one clear action. Separate “Open this app/window,” “Restore workspace,” and “Undo” by their true behavior. |
| Filmstrip | Keep as a visual browsing mode only when real previews exist; label missing preview data explicitly. Provide date/group headers and keyboard selection. |
| Curtain Diff | Present as a comparison tool reached from two selected moments; avoid a blank/faux comparison when snapshots are absent. Include before/after timestamps and accessibility-friendly divider controls. |
| Analytics | Move to a secondary Insights page; explain metric definitions, source coverage, and “not enough data” state. Never show fabricated fallback measurements as if measured. |
| Omnibox/search | Make this the cross-surface action/search entry point. Clearly scope what it searches and distinguish commands from moments. |
| Extension timeline | Retain the three-pane concept at wide sizes; make responsive collapsing behavior, focusable delete, live changes and robust error/empty states explicit. Share tokens/components with Studio. |
| HUD | Keep it task-focused and compact. Clarify capture on/off/pause state, last saved moment and fast search/restore. Avoid making a separate HUD behave like a second unrelated dashboard. |
| Browser fixture | Move to a named demo route or developer build, with a visible “sample data” label; do not surface it as a product mode in regular use. |

## 4. Confirmed technical and product issues

Complexity uses XS (< half day), S (0.5–1 day), M (2–4 days), L (1–2 weeks), XL (multi-week or cross-platform work). Estimates are directional, not commitments.

| Priority | File/component | Confirmed issue and impact | Recommended correction | Complexity |
|---|---|---|---|---|
| **High** | `src/dashboard/GrandDashboard.tsx:425-433` | “Universal Undo” calls `handleJumpMoment(selectedMoment)`, which only changes selected moment and plays audio. It does not invoke the daemon/desktop undo action. Users may believe an undo happened when it did not. | Wire to a real, safety-checked undo RPC/API and report result, or rename/remove the control until it is real. Add interaction test asserting the requested backend method fires. | S–M |
| **High** | `src/dashboard/flow/MomentNode.tsx:32-37, 93-107`; `InspectorDrawer.tsx:172-182`; `GrandDashboard.tsx:277-284` | “Jump” and “Resurrect & Jump” similarly select a moment and play a sound; they do not jump to/restore the window. Workspace resurrection is a separate, actual daemon action. The shared language conflates navigation, relaunch and undo. | Define operation vocabulary and connect each CTA to its intended capability; if not connected, use “Select moment.” Add tests for every primary action. | M |
| **High** | `src/dashboard/GrandDashboard.tsx:70-80`, `src/dashboard/hooks/useDaemonRpc.ts:43-77` | Disconnected/default state shows plausible numeric analytics; when live data becomes unavailable, prior stats/moments are not consistently reset. This can make stale or illustrative data appear real. | Make data provenance and last-updated status visible; use null/empty placeholders, clear stale metrics or explicitly label stale cache; never invent dashboard numbers. | S |
| **High** | `src/dashboard/dashboard.css` (entire 500-line file) | No responsive media queries in the main Studio stylesheet; fixed controls and inspector width plus a long non-wrapping header leave resize/narrow windows unaddressed. | Establish breakpoints; collapse actions into menus, inspector into a drawer, and timeline views into list/mobile navigation. Verify 1280px, 1024px, 768px and narrow windows. | M |
| **High** | `daemon/capture/windowCapture.ts:83-134, 158-335` | GDI capture is implemented in source, so the old report’s “solid gray placeholder” claim is stale. However, actual capture is unverified on real Windows and currently reads pixels synchronously through native calls and writes BMP synchronously; capture loop interval is 2 seconds. If native capture or large images are slow, the daemon’s event loop can stall and affect RPC responsiveness. | Run dedicated Windows capture QA (DPI, protected/occluded windows, zero-size/slow targets, cleanup and pixel sanity); profile; downsample before storage/hash or move heavy work off the RPC event loop. Treat as a validation/performance risk, not a confirmed failure. | M–L |
| **High** | `daemon/privacy.ts:40-47`; `desktop/security.js:43-68`; `extension/content.js:9-27, 94-110` | Privacy protections are classification/heuristic-based. Unknown process names and missing window titles are not always denied, and web masking cannot recognize every custom input. This is acknowledged in docs, but “never captured” phrasing is stronger than the underlying guarantees. | Use conservative unknown-state policy where feasible; provide a visible global pause and per-app/site deny/allow controls; document exact capture boundary and implement redaction tests for custom controls. | M |
| **Medium** | `src/dashboard/GrandDashboard.tsx:130-235` | Timeline graph uses fixed horizontal spacing per moment, so large histories expand linearly and make the time dimension difficult to overview. Many nodes can also increase React Flow layout/render costs. | Use viewport-windowed, time-scaled lanes with aggregation/clustering by default; only expand detail on demand; benchmark 10k+ moments. | L |
| **Medium** | `src/dashboard/GrandDashboard.tsx:286-435`; `src/dashboard/dashboard.css:1-18` | Inconsistent inline styles and CSS variables produce a one-off component system; all-cyan/neon/emoji controls contribute to visual clutter and drift. | Extract design tokens and shared button, badge, toolbar, card and status components; define typography and spacing scale; reserve accent for state/action. | M |
| **Medium** | `src/App.tsx:283-307`; `src/dashboard/GrandDashboard.tsx:488-514` | Production view exposes demo-fixture switch and developer badge as persistent floating controls. This distracts from the core tasks and exposes development implementation details. | Move developer info to About/settings and gate fixture behind a development route/flag. | XS–S |
| **Medium** | `src/dashboard/InspectorDrawer.tsx:87-130` | Click-to-copy OCR tokens and selectors are non-button elements; keyboard access, focus, and action semantics are missing. | Use buttons with accessible names, visible focus, and a live-region confirmation. | XS |
| **Medium** | `extension-src/src/Timeline.tsx:259-275` | Delete control is nested in a clickable session button and is represented by an `<i role="button">`; this creates invalid/ambiguous nested interaction and weak keyboard semantics. | Render row container with separate session-select and delete buttons; expose confirmation and focus behavior. | XS–S |
| **Medium** | `extension-src/src/Timeline.tsx:54-92` | Session index and selected recording are polled every 2 seconds/1.5 seconds even though extension storage change events can provide updates. This does unnecessary wakeups and adds UI latency. | Subscribe to `chrome.storage.onChanged` and background messages, with a slow reconciliation timer only as fallback. | S |
| **Medium** | `src/dashboard/hooks/useDaemonRpc.ts:43-88` | Polling every 4 seconds runs overlapping request groups if a prior call takes longer, and state handling can keep stale values after disconnect/empty response. | Use a single-flight recursive timeout, abort/timeouts, last-success metadata, explicit disconnected cache policy and user-visible errors. | S |
| **Medium** | `daemon/vault/vaultEngine.ts:40-64, 70-109`; CLI `bin/rewind.js` vault flow | Vault engine reads full input and builds JSON/base64, gzip and encryption buffers in memory. Large timelines can require multiple times their file size in memory. The raw SQLite file is the input; backup consistency around active WAL state needs real verification. | Use SQLite’s online backup API or checkpoint/backup snapshot, stream/compress/encrypt large files, cap decompressed/archive sizes, validate metadata and test restore of a database while daemon is active. | M–L |
| **Medium** | `desktop/dashboardPreload.cjs:11-16`; `src/dashboard/hooks/daemonClient.ts` | Dashboard preload exposes synchronous token retrieval to renderer, and the dashboard needs the token to call a powerful local daemon (including restore/launch behavior). This increases impact of any renderer XSS/compromised content. Dashboard BrowserWindow also sets `sandbox: false` (`desktop/main.js:159-173`), unlike the HUD. No exploit was demonstrated; this is defense-in-depth risk. | Prefer a narrow main-process IPC façade that validates specific operations and never hands a bearer token to page JavaScript; enable sandbox where compatible; enforce strict CSP and keep remote navigation blocked. | M–L |
| **Medium** | `daemon/rpc/httpBridge.ts:65-69, 119-131` | If no extension ID is pinned, the bridge accepts any syntactically valid Chrome extension origin; requests without Origin are also allowed if the bearer token is supplied. Token remains the primary guard, so this is hardening, not a confirmed unauthenticated bypass. | Pin the packaged extension ID by default, document dev setup, reject missing Origin for browser-only endpoints where compatible, and keep token validation. | S |
| **Medium** | `src/App.css`, `src/final.css` | Fixture styles are minified into one line and later patched by a separate override stylesheet, increasing regressions and making design tokens inaccessible. | Reformat, consolidate selectors and treat the fixture as a test/demo package separate from product styles. | S |
| **Low** | `ARCHITECTURE.md`, `README.md`, `ROADMAP.md`, `AGENTS.md` | Documents disagree on whether `src/` is a fixture or primary dashboard, version/milestone status, subsystem layout and feature maturity. The README’s version 6 feature statements are not aligned with the roadmap’s v6 queued status. | Establish one source of truth for shipped capability/status; mark tested vs unverified vs planned; add a release-doc consistency check. | S |
| **Low** | `src/dashboard/GrandDashboard.tsx`, `src/dashboard/MomentNode.tsx` | Mouse hover triggers audio in the node graph; dense interaction can cause frequent nonessential audio. Reduced-motion/sound preference interactions are not obvious from the reviewed surface. | Avoid hover sound by default; respect system reduced motion and provide quiet defaults. | XS |

### Confirmed strengths / negative claims not supported by this checkout

- `.github/workflows/ci.yml` exists and runs lint, tests, main build, extension build and daemon build on Ubuntu with Node 22. Therefore “no CI” in the historical `.kilo/plans/1791695703827-audit-verification-report.md` is no longer true.
- `extension/background.js` now has per-tab queues, pending-event mirroring to `chrome.storage.session`, retry-on-storage-error behavior, event/recording limits, quota handling, tab-close cleanup, and orphan reconciliation. Therefore the old report’s claims of no retention, lost in-memory-only buffers and no tab cleanup are stale.
- `daemon/rpc/rpcServer.ts` includes serialized per-connection processing, auth deadline/failure cap, line-size limits and bounded RPC execution. The old report’s unauthenticated framing/race claims should not be repeated as current findings.
- `daemon/capture/windowCapture.ts` contains real Koffi Win32 APIs for foreground-window info, PrintWindow, GetDIBits and bitmap persistence; it explicitly states the driver has not been exercised on a Windows machine. The old “flat gray framebuffer” claim is contradicted by current source.
- No actual security exploit or live Windows failure was demonstrated in this review. Security observations above are hardening/validation recommendations, not confirmed vulnerabilities.

## 5. Performance, reliability and testing

**Likely performance hot spots:** synchronous image allocation/readback/encoding and synchronous filesystem writes in the daemon capture path; graph generation over every moment in `GrandDashboard.tsx`; two independent dashboard polling systems (daemon every four seconds and extension timeline at 1.5/2 seconds); large vault operations that buffer several full-size representations in memory. These are risks inferred from code paths; profiling is required before asserting user-visible slowness.

**Reliability improvements:** define a single data freshness model for daemon states; do not silently preserve stale stats; present save/export failures at the point of action; make shutdown and restore operations report partial failures; perform Windows integration tests for GDI and multi-monitor placement. The CI workflow is a good foundation but Ubuntu mocks cannot validate Windows APIs, Electron packaging, secureStorage/DPAPI, named pipes or real restoration.

**Test status:** `package.json` includes Vitest and `vite.config.ts` configures `happy-dom`; CI runs tests and all three builds. The repository contains tests in daemon, desktop, CLI, fixture and a test for extension/background behavior (`tests/extension/background.test.ts`). This audit did not execute tests or assess assertions/coverage quality. Add targeted behavior tests for the misleading Studio buttons, stale/demo state, responsive accessibility, extension nested controls, storage failure UX, and Windows native capture/restore.

## 6. Security and privacy assessment

The local-first architecture and explicit boundaries are thoughtful: daemon binds loopback, bearer token checks are constant-time per historical audit and current code has bounded requests; named pipe is local; Electron HUD uses context isolation, disabled Node integration, sandbox, allow-listed channels and navigation denial; extension masks common credential field types and attributes before serialization; encrypted vault uses AES-256-GCM and PBKDF2-HMAC-SHA256.

The residual central risk is that the product observes sensitive activity. A title/process denylist and DOM attribute heuristic can reduce exposure but cannot guarantee complete privacy. User-facing language should distinguish “best-effort redaction” from a hard guarantee. Add visible capture indicators, per-app/site controls, audit/export/delete controls, quick pause, and privacy-state reporting. Verify whether screenshots and database files receive suitable user-only Windows ACLs and whether the desktop/daemon data stores use encryption consistently; this source review did not validate OS ACLs or on-disk behavior. For the dashboard, avoid exposing the broad daemon bearer token to renderer JavaScript if a narrow validated main-process bridge can satisfy UI operations.

## 7. Missing product capabilities and opportunities

### Essential / quality baseline

1. A reliable, honest chronological activity timeline shared across desktop and Studio.
2. Explicit recording state: paused, active, blocked, disconnected, demo, or stale; include last capture timestamp.
3. Actual screenshot previews when present, and clear unavailable states when not present.
4. Correctly scoped actions: select, focus/open, workspace-resurrect, and app-level undo must remain distinct.
5. Usable responsive layouts, keyboard/focus behavior and reduced-motion/sound preferences.
6. Transparent per-source retention, deletion and storage usage (desktop, daemon, browser extension).
7. Real Windows release acceptance, plus tested crash/restore behavior for database and vault operations.

### Differentiating opportunities (optional after baseline)

- “Find the moment” semantic/local search with visible evidence and app/time filters; explain whether a result came from title, OCR, browser event or Git context.
- Context cards that summarize a work session and link to related app windows, editor files, terminal directory and browser tabs, with a preview-first restore plan.
- Privacy profiles (work/personal/presentation) with app/site inclusion rules and one-click pause.
- A transparent “restore confidence” score based on what was actually captured and what can be reopened.
- Local-only user-defined capture retention and storage budgets, with screenshots and metadata retention separable.
- A small, opt-in “memory” layer over local events that answers “what was I doing before lunch?” with citations to actual moments, not fabricated productivity judgments.

## 8. Prioritized implementation roadmap

### Phase 0 — Truth, terminology and safety (1–2 weeks)

- Fix or rename Studio “Universal Undo,” graph “Jump,” and inspector “Resurrect & Jump” actions; write integration tests for each operation.
- Separate demo fixture from normal product build and visibly label any remaining fallback/demo data.
- Make analytics provenance/freshness clear and remove plausible fake metric defaults.
- Update README, architecture, roadmap and AGENTS status to match code; label Windows-native features unverified until hardware QA.

**Exit criteria:** Every primary button’s name matches its observable behavior; no demo values are presented as live measurements.

### Phase 1 — Visual system and core Studio IA (2–4 weeks)

- Choose the product direction: “private activity time machine.” Harmonize lime/cyan accents; adopt readable sans-first UI typography and mono only for technical data.
- Define spacing, surfaces, type scale, borders, focus, motion and status tokens; componentize common buttons, badges, panels and dialogs.
- Rebuild header into brand/status, primary timeline/search, and secondary actions menu. Move developer link and dev fixture out of the task path.
- Make chronological timeline the default; preserve graph, filmstrip and diff as optional modes. Improve empty/loading/error/disconnected states.

**Exit criteria:** One coherent design language across Studio and extension, usable at target desktop widths, and one obvious path to find/select/restore a moment.

### Phase 2 — Responsive and accessible interactions (2–3 weeks)

- Add tablet/narrow-window composition, inspector drawer, wrapping/collapsed actions and appropriate graph fallback.
- Replace clickable spans and nested button interactions with semantic controls; add keyboard focus, accessible labels, live announcements and reduced-motion/audio options.
- Review contrast and target sizes; test keyboard-only paths and screen-reader landmarks.

**Exit criteria:** WCAG-oriented manual review completed at 1280, 1024, 768 and 375 CSS-pixel widths, with keyboard-only smoke tests.

### Phase 3 — Capture and data reliability (2–4 weeks)

- Test native capture on supported Windows hardware across DPI, occlusion, minimized/protected apps and multiple monitors; measure capture latency and RPC responsiveness.
- Add representative image fixtures and tests; downsample/throttle capture if profiling warrants.
- Test SQLite WAL backup consistency and vault memory behavior on large datasets; use an online SQLite backup/snapshot strategy for active DB vault creation.
- Consolidate status, freshness, failure retry and persistence messaging; test storage-full and daemon-restart paths.

**Exit criteria:** Verified Windows test matrix, measured performance thresholds, consistent backup restore and surfaced persistence errors.

### Phase 4 — Cross-surface product integration (3–6 weeks)

- Establish shared timeline/domain types and explain data boundaries among daemon, desktop and extension.
- Replace renderer-held broad token use with a narrow, validated main-process API where applicable; pin extension identity for packaged deployment.
- Add live push/change notifications or a single-flight refresh strategy; eliminate unnecessary periodic polling.
- Make unified search, session grouping, restore preview and source-aware privacy/retention work consistently across surfaces.

**Exit criteria:** User can move between desktop and browser history without confusing data sources, and every restore path has safe preview/result reporting.

### Phase 5 — Differentiators and release hardening (ongoing)

- Add evidence-backed local recall and work-session summaries only after privacy controls and data provenance are robust.
- Automate doc/version consistency, release packaging, Windows integration tests, accessibility checks and performance regression checks.
- Run usability sessions with users who are not the author/developer; prioritize first-use clarity over feature count.

## 9. Final recommendation

Do not start with a full visual rewrite or add more AI/analytics. First fix the mismatch between labels and behavior, remove misleading demo metrics, verify Windows capture, and simplify the core workflow around a trustworthy timeline. Then establish a shared design system and make the Studio responsive. Rewind’s strongest distinctive proposition is the ability to recover context privately and locally; the interface should make that recovery feel clear, safe and dependable rather than expose every subsystem at once.
