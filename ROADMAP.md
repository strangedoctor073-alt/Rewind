# REWIND: Master Multi-Agent Execution Roadmap & Architecture Guide (v1.0 - v6.0)

> **Document Status**: Production Execution Blueprint  
> **Target Audience**: AI Coding Agents, Pair-Programmers, System Architects  
> **Current Shipped Version**: **v4.0.0** (Tag `v4.0.0` on GitHub)  
> **Next Active Milestone**: **v5.0.0** (Deep State Resurrection & Workspace Time Travel)  

---

## 🧭 Executive Summary & Mission

**REWIND** is a local-first system activity timeline, universal undo engine, browser interaction recorder, and workspace resurrection platform for Windows and Chromium.

The system is designed around **zero-keylogging**, **strict zero-trust boundaries**, and **crash-resilient atomic storage**. As of v4.0.0, the core headless daemon, Win32 frame capture, CAS blob deduplication, SQLite FTS5 + vector store, hybrid RRF search, and Ollama standup generation are live and verified across 34 test suites and 217 tests.

This document serves as the **definitive operational guide** for any subsequent agent taking over this workspace. It specifies what has already shipped, what exact files exist, and how to execute **v5.0** and **v6.0** step-by-step.

---

## 🏛️ Repository Architecture & Subsystem Boundaries

The codebase is organized into modular boundaries. **Do not conflate data schemas between subsystems**:

```
REWIND/
├── bin/                       # Headless CLI tools (`rewind start/stop/status/search/undo/etc.`)
├── daemon/                    # Node.js/TypeScript background IPC daemon
│   ├── ai/                    # v4.0: Embeddings, Vector Store, Hybrid RRF Search, Ollama connector
│   ├── blobs/                 # v3.0: FastCDC, CAS BlobStore, Compressor, FS Watcher, BlobIndex
│   ├── capture/               # v2.0: Win32 PrintWindow, dHash deduplicator, BMP encoder
│   ├── clipboard/             # v3.0: Multi-format clipboard store, Ghost Shield entropy scanner
│   ├── db/                    # better-sqlite3 WAL database, FTS5 indexes & migrations
│   ├── git/                   # Git HEAD watcher & branch isolation
│   ├── ocr/                   # v3.0: Word-level bounding box store & hit-testing
│   └── rpc/                   # Windows Named Pipe & WebSocket RPC Server (HMAC token security)
├── desktop/                   # Electron App & Floating HUD pill
│   ├── overlay/               # Sandboxed HUD renderer (`hud.js`, `hud.css`)
│   ├── win32.js               # Koffi Win32 FFI bindings (`IsHungAppWindow`, `SendMessageTimeoutW`)
│   └── undoEngine.js          # Focus handshake & verified synthetic undo
├── extension/                 # Distributable unpacked Chromium MV3 Extension
├── extension-src/             # TypeScript source for Chrome MV3 extension
└── src/                       # React 18 + Vite Web App & Grand Dashboard Studio
    ├── audio/                 # Procedural Web Audio synthesizer (zero asset footprint)
    └── dashboard/             # Grand Dashboard (@xyflow/react node graph, Filmstrip, Omnibox)
        ├── clipboard/         # v3.0: Visual clipboard history scrubber
        ├── ocr/               # v3.0: Click-to-copy bounding box overlay
        └── standup/           # v4.0: Cognitive standup & commit synthesis modal
```

---

## 🚨 Critical Agent Rules & Invariants (Must Follow Without Exception)

1. **Trap 1: Win32 Buffer NUL-Padding**: Always sanitize Win32 string buffers with `.replace(/\0+$/, '').trim()`. Trailing `\0` bytes break `fs.existsSync` and `child_process.spawn`.
2. **Trap 2: Extension Rebuilds**: Modifying `extension-src/` does NOT automatically build `extension/`. Always run `npm run build:extension` after changing extension code.
3. **Trap 3: Zero-Trust IPC**: The renderer UI (`desktop/overlay/` or browser dashboard) must never be trusted with arbitrary OS commands or filesystem paths. Restores and resurrect actions must be validated against the daemon's internal state. Checkpoint IDs must strictly match `^[a-zA-Z0-9_-]+$`.
4. **Trap 4: Ghost Shield Privacy & Zero Keylogging**:
   - **Zero Global Hooks**: Never install `WH_KEYBOARD_LL`. The only synthetic keystroke REWIND ever dispatches is `Ctrl+Z` to trigger Undo.
   - **Exclusion Filters**: Windows mentioning `incognito`, `private browsing`, `password`, `sign in`, `1Password`, `Bitwarden`, or banking sites must **never** be captured or indexed.
   - **High-Entropy Redaction**: Clipboard content with high Shannon entropy or matching API key/credit card/SSH key signatures must be masked as `[REDACTED]`.
5. **Trap 5: Atomic Writes**: Never overwrite state or WAL files with raw `fs.writeFileSync`. Always write to `.tmp` first, then atomically rename via `fs.renameSync`.
6. **Trap 6: Linux CI Compatibility**: CI runs on Linux runners. Koffi Win32 FFI bindings must be cleanly mocked in `__tests__/` so that `npm test` runs without Windows DLLs.
7. **Trap 7: TypeScript Composite Mode**: Always typecheck using `npx tsc -b`.

---

## 📦 Version History & Current Status

| Version | Status | Codename | Core Shipped Features |
| :--- | :--- | :--- | :--- |
| **v1.0.0** | ✅ Shipped | **Genesis** | Electron floating pill HUD, basic Win32 active window polling, 20s atomic WAL, synthetic undo. |
| **v2.0.0** | ✅ Shipped | **Decoupled Core** | Headless IPC Daemon, Win32 GDI capture, dHash deduplication, SQLite FTS5 timeline, CLI (`bin/rewind.js`), Grand Dashboard (`@xyflow/react`). |
| **v3.0.0** | ✅ Shipped | **Delta Time Machine** | Content-addressable blob store (`~/.rewind/blobs/`), FastCDC chunking, DEFLATE compression, Ghost Shield entropy scanner, visual clipboard history, OCR bounding box click-to-copy. |
| **v4.0.0** | ✅ Shipped | **Cognitive Recall** | 384-d dense vector embeddings, in-memory vector store, hybrid BM25 + Vector search with Reciprocal Rank Fusion (RRF), Ollama LLM connector with offline heuristic fallback, Standup modal UI. |
| **v5.0.0** | 🔜 **NEXT** | **Deep Resurrection** | State resurrection across VS Code, Windows Terminal, and Chrome tabs; multi-monitor window geometry restore. |
| **v6.0.0** | 🔮 Queued | **Autonomous Flow** | Scriptable Playwright & PowerShell macro exporter, productivity & context-switch analytics, encrypted air-gapped zero-knowledge vault backups. |

---

## 🛠️ Step-by-Step Execution Guide: Version 5.0 (Deep Resurrection)

### Primary Goal
Transition REWIND from a passive observer/recorder into an active **Workspace Time Machine** capable of resurrecting past IDE files, terminal directories/shells, and browser tabs with pixel-perfect window placement.

### Phase 5.1: Editor Protocol Adapters (`daemon/resurrect/editors/`)
- [ ] Create `daemon/resurrect/types.ts`: Define `IEditorAdapter`, `ResurrectTarget`, `ResurrectResult`.
- [ ] Implement `vscodeAdapter.ts`:
  - Parses window titles (e.g. `filename.ts - project - Visual Studio Code`) and active file paths.
  - Constructs protocol URL: `vscode://file/<abs_path>:<line>:<col>` (or `cursor://` / `idea://`).
  - Dispatches launch via `child_process.spawn('cmd.exe', ['/c', 'start', url])`.
- [ ] Add tests in `daemon/resurrect/__tests__/vscodeAdapter.test.ts`.

### Phase 5.2: Terminal Shell Resurrection (`daemon/resurrect/terminal/`)
- [ ] Implement `terminalAdapter.ts`:
  - Captures terminal PID, current working directory (`cwd`), shell flavor (`pwsh`, `cmd`, `bash`), and git branch.
  - Generates launch command for Windows Terminal: `wt.exe -d "<cwd>" <shell>` or opens native PowerShell at recorded directory.
  - Sanitizes paths to prevent shell injection.
- [ ] Add tests in `daemon/resurrect/__tests__/terminalAdapter.test.ts`.

### Phase 5.3: Browser Multi-Tab Session Replay (`daemon/resurrect/browser/`)
- [ ] Implement `browserReplayAdapter.ts`:
  - Queries `browser_events` table for tabs open at moment timestamp.
  - Sends RPC message to Chrome Extension via WebSocket to open target tab set or scroll to recorded `(scroll_x, scroll_y)`.
- [ ] Update extension background script (`extension/background.js` & `extension-src/`) with listener for tab restoration commands.

### Phase 5.4: Multi-Monitor Window Geometry Restoration (`daemon/resurrect/geometry/`)
- [ ] Implement `windowGeometryRestorer.ts`:
  - Uses Win32 `SetWindowPos` via Koffi to restore `(x, y, w, h)` and z-order of relaunched applications.
  - Adapts to DPI scaling factors across multi-monitor setups.
- [ ] Implement RPC method in daemon: `timeline.resurrectWorkspace`.

### Phase 5.5: Dashboard "Resurrect" UI Action
- [ ] Add a prominent **⚡ Resurrect Workspace** button to `InspectorDrawer.tsx` and `GrandDashboard.tsx`.
- [ ] Connect button to daemon RPC `timeline.resurrectWorkspace`.

### Phase 5.6: Verification & Release of v5.0
- [ ] Ensure all test suites pass: `npm test`
- [ ] Ensure ESLint clean: `npm run lint`
- [ ] Ensure TypeScript composite build clean: `npx tsc -b`
- [ ] Bump version in `package.json` to `5.0.0`.
- [ ] Commit, tag `v5.0.0`, push, and publish GitHub release via `gh release create v5.0.0`.

---

## 🛠️ Step-by-Step Execution Guide: Version 6.0 (Autonomous Flow & Vaults)

### Primary Goal
Turn captured action history into runnable automation scripts, deliver focus and burnout telemetry, and secure backups in zero-knowledge encrypted vaults.

### Phase 6.1: Playwright Script Generator (`daemon/macros/playwright/`)
- [ ] Read recorded DOM click, type, and navigation events from `browser_events`.
- [ ] Convert sequences into clean, executable Playwright TypeScript code:
  - Generates `page.goto(url)`, `page.locator(selector).click()`, `page.fill(selector, text)`.
  - Automatically replaces masked inputs with configurable environment variable placeholders (`process.env.SECRET`).
- [ ] Implement CLI subcommand: `rewind macro export --format playwright --output ./flow.spec.ts`.
- [ ] Add tests in `daemon/macros/__tests__/playwrightExporter.test.ts`.

### Phase 6.2: PowerShell DevOps Macro Exporter (`daemon/macros/devops/`)
- [ ] Convert consecutive terminal commands and filesystem edits into idempotent `.ps1` automation scripts.
- [ ] Add CLI subcommand: `rewind macro export --format powershell`.

### Phase 6.3: Focus & Productivity Analytics Engine (`daemon/analytics/`)
- [ ] Implement `focusEngine.ts`:
  - Computes **Deep Focus Score** based on continuous uninterrupted time in IDEs/design tools.
  - Calculates **Context-Switch Velocity** (flags distraction spikes when user flips between >5 apps in 2 minutes).
  - Generates application usage heatmaps and context shift reports.
- [ ] Add `FocusTelemetryWidget.tsx` to the Grand Dashboard.

### Phase 6.4: Zero-Knowledge Air-Gapped Encrypted Vaults (`daemon/vault/`)
- [ ] Implement `vaultEngine.ts`:
  - Encrypts timeline database and blob backups using AES-256-GCM with Argon2id / PBKDF2 key derivation.
  - Produces standalone `.rewind-vault` files suitable for offline USB / air-gapped storage.
- [ ] Implement CLI command: `rewind vault create --out ./backup.vault` and `rewind vault restore ./backup.vault`.

### Phase 6.5: Verification & Release of v6.0
- [ ] Full Vitest run (`npm test`), ESLint (`npm run lint`), TypeScript build (`npx tsc -b`).
- [ ] Bump `package.json` to `6.0.0`.
- [ ] Commit, tag `v6.0.0`, push, and publish final GitHub release.

---

## 📋 Standard Verification Checklist for Every Agent

Before pushing or tagging any version, run these commands in order:

```bash
# 1. Run all Vitest test suites (Must have 0 failed)
npm test

# 2. Run ESLint (Must have 0 errors, 0 warnings)
npm run lint

# 3. Typecheck all projects
npx tsc -b

# 4. If modifying extension:
npm run build:extension

# 5. If modifying web app / dashboard:
npm run build
```

---

*This document is the source of truth for all current and future REWIND agents. Keep it updated as milestones complete.*
