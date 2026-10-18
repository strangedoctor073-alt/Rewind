# Changelog

## 5.10.0 - Full Subsystem Integration & RPC Unification

### Added
- **Clipboard Timeline RPCs** (`daemon/index.ts`, `daemon/db/timelineDb.ts`):
  - Implemented `clipboard.history` and `clipboard.search` RPC methods on the daemon.
  - Added query and FTS search helpers (`getClipboardHistory`, `searchClipboard`, `insertClipboardEntry`) to `TimelineDatabase`.
  - Re-wired `ClipboardPanel.tsx` in the web studio to use authenticated JSON-RPC (`callDaemon`) instead of raw localhost `/api/` fetch requests.
- **Cognitive Standup & AI RPC** (`daemon/index.ts`, `src/dashboard/standup/StandupModal.tsx`):
  - Implemented `ai.standup` RPC handler dispatching to `OllamaConnector.generateSummary()` with offline heuristic fallback.
  - Re-wired `StandupModal.tsx` to communicate with the daemon via `callDaemon('ai.standup', { type })`.
- **Test Coverage**:
  - Added unit test suites verifying clipboard history extraction, search, and AI summary dispatch in `timelineDb.test.ts` and `index.test.ts`.

---

## 5.8.0 - Daemon-Extension Bridge & Cross-Origin Sync

### Added
- **Chrome Extension Host Permissions** (`extension/manifest.json`): Added `host_permissions` targeting loopback HTTP bridge endpoints (`http://127.0.0.1:48292/*`, `http://localhost:48292/*`), enabling unpacked extension pages and background service workers to directly communicate with the daemon.
- **Strict Extension Origin Support** (`daemon/rpc/httpBridge.ts`): Allowed verified `chrome-extension://[a-p]{32}` origins in CORS preflight and RPC headers while defending against untrusted web origins.
- Added tests in `daemon/rpc/__tests__/httpBridge.test.ts` validating extension preflight handshake acceptance.

---

## 5.6.0 - NSIS Distribution & Packaging

### Added
- **NSIS Windows Installer Pipeline** (`electron-builder.json`, `npm run pack`, `npm run dist`):
  - Nullsoft Scriptable Install System (NSIS) packaging targeting x64 Windows systems.
  - Dual install modes: per-user (unprivileged, non-admin default to `%LOCALAPPDATA%`) and per-machine option.
  - Automatic desktop shortcut and Start Menu program entry creation with clean uninstaller hooks.
  - Asar unpacking configured for native FFI and C++ bindings (`better-sqlite3`, `koffi`).
  - Standalone zero-installation portable binary target (`${productName}-${version}-portable.exe`).

---

## 5.4.0 - Telemetry & Provenance

### Added
- **Focus Telemetry Widget** (`src/dashboard/telemetry/FocusTelemetryWidget.tsx`): Interactive dashboard panel featuring a 270° SVG circular Focus Score gauge, category-coded application breakdown bars, 24-hour activity heatmaps, and distraction spike monitoring. Integrated into Grand Dashboard with a new 📊 Analytics view mode and live polling from `analytics.focusReport`.
- **Verified Undo RPC** (`daemon/index.ts`, RPC `timeline.undo`): Zero-trust verification resolving moment context exclusively from daemon SQLite store. Implements synthetic window-targeted `Ctrl+Z` dispatch via `WScript.Shell` on Windows without installing global keyboard hooks.
- **Provenance Chain Exporter** (`daemon/index.ts`, RPC `provenance.export`): Zero-trust provenance exporter tracing moments backward and forward around an anchor moment with configurable window depth, returning structured schema versioning, branch information, and sanitized OCR tokens.

---

## 5.2.0 - Autonomous Flow & Vaults

### Added
- **Playwright Macro Exporter** (`daemon/macros/playwright/playwrightExporter.ts`, RPC `macro.export`, `rewind macro export`): converts a recorded browser session into a runnable Playwright TypeScript test. Navigates, clicks, fills, scrolls; masks secrets as `process.env.*`; optional `expect()` assertions on every interaction. Accepts `--format`, `--output`, `--name` flags.
- **PowerShell DevOps Macro Exporter** (`daemon/macros/devops/powershellExporter.ts`): emits a `.ps1` script from the same browser recording. Elevation check, idempotent structure, sensitive env vars masked via `Read-Host -AsSecureString`. Select with `--format powershell`.
- **Focus & Productivity Analytics Engine** (`daemon/analytics/focusEngine.ts`, RPC `analytics.focusReport` / `analytics.telemetryStats`): computes Deep Focus Score (0–100), Context-Switch Velocity (switches/hr), distraction spike detection, per-app heatmap and hourly activity heatmap from the SQLite timeline. `rewind status` now shows Focus % and Context Switches/hr. Dashboard `useDaemonRpc` polls `analytics.telemetryStats` alongside the timeline.
- **Zero-Knowledge AES-256-GCM Encrypted Vaults** (`daemon/vault/vaultEngine.ts`, `rewind vault create|restore`): offline-only CLI vault for backing up and restoring timeline data. AES-256-GCM + PBKDF2-SHA-256 (100 k iterations, 32-byte salt, 12-byte IV, 16-byte auth tag), gzip compression, atomic write via `.tmp` rename, magic header `REWIND_VAULT_V1\0`. No RPC exposure — vault operations are intentionally air-gapped.

### Fixed
- `extension/__tests__/background.test.ts`: test "closes out a recording when its tab is closed" had a race between `saveRecording()` setting `active: false` and the subsequent `chrome.storage.local.remove(sessionPointerKey)` (fake store has a `setTimeout(0)` per op). Polling loop now waits for both conditions before asserting. Added `20_000 ms` timeout to match the other polling tests.

### Versioning note
From this release onward, increments follow an **even-minor** scheme under the v5 umbrella: `5.0 → 5.2 → 5.4 → 5.6 → … → 5.10 → 5.10.1 …`. All even-minor releases accumulate into a full **v5** release.

---

## 5.0.0 - Deep Resurrection

### Added
- **Workspace resurrection** (`timeline.resurrectWorkspace`, `rewind resurrect <momentId> [--dry-run]`, dashboard **⚡ Resurrect Workspace** / **Preview**): reopens VS Code / Insiders / Cursor files, Windows Terminal directories and browser tabs recorded around a moment, then restores window placement. `daemon/resurrect/`.
- Zero-trust by construction: only a moment id is accepted; everything launched is derived from the daemon's own database; commands are argv arrays from a two-entry allow-list (`rundll32.exe`, `wt.exe`); URLs/paths are validated; Ghost Shield applies on the way out too.
- **Dashboard HTTP bridge** (`daemon/rpc/httpBridge.ts`, port 48292): loopback only, bearer token, Host + Origin checks, JSON content type, 64 KB cap. `rewind token` prints the pairing token.
- `daemon/main.ts` entrypoint, `npm run build:daemon`, `npm run daemon`.
- Extension: `REWIND_RESTORE_TABS` handler; first test suite for the extension.
- Retention: moments older than `retentionDays` (default 30) and their screenshots are purged hourly; the WAL is actually checkpointed on its timer.

### Fixed (found in the v5.0 audit)
- **`rewind start` never started anything.** It spawned `node --import tsx daemon/index.ts`; `tsx` was not a dependency and `index.ts` only exported a class. Now spawns the compiled `dist-daemon/daemon/main.js` and verifies it answers.
- **Dashboard could never connect to the daemon** (HTTP `fetch` against a raw-TCP JSON-RPC port).
- **Windows capture silently never worked**: `require('koffi')` in an ES module threw and was swallowed. Replaced the placeholder drivers (which fabricated a window handle and grey pixels on non-Windows) with a real fail-closed GDI driver; captured moments now record the real window title, process and bounds instead of the literal "ActiveWindow".
- **Ghost Shield was absent from the daemon capture path.** Password managers / incognito windows are now vetoed before any pixels are read (`daemon/privacy.ts`, parity-tested against `desktop/security.js`).
- RPC server: `stop()` hung forever while any client was connected (so the database was never closed after `rewind stop`); a port clash crashed the process; handlers' `{code,message}` errors were reported as "Internal error"; a 10 s timer leaked on every error; pipelined requests could be answered out of order; no limit on failed auth attempts or on silent unauthenticated connections.
- Daemon start: the auth token was overwritten *before* the port was bound, so a second daemon locked clients out of the first; a failed start leaked the DB handle. `daemon.status` reported at most 50 moments; `daemon.pause` accepted NaN/negative minutes and a stale timer could un-pause a later pause early; capture ticks could overlap.
- `auth.token` is now written with mode 0600.
- Database: moment + FTS insert is one transaction; `limit`/`offset` are clamped.
- Desktop: after a timed privacy pause expired the **clipboard engine stayed paused forever**; windows merely containing "Rewind" in their title (e.g. an editor on this project) were never recorded; unvalidated renderer input could throw inside the main process (`copy-to-clipboard`, pause minutes, checkpoint label); a second instance could run alongside the first.
- Extension: events were lost to read-modify-write races, failed saves, and service-worker eviction; recordings could grow past the storage quota; starting twice or closing a tab left recordings "active" forever; `<textarea>` fields were never masked; textarea/select labels leaked their contents; unescaped values in generated selectors; "Extension context invalidated" errors.
- CLI: `autostart enable` wrote a broken registry value (unquoted `/d` argument, cwd-relative path); `rewind pause abc` sent NaN. The CLI no longer runs when imported.
- Tooling: `daemon/` was not covered by any tsconfig (two real type errors hid there) and `desktop/`, `bin/`, `extension/` JavaScript was never linted (9 findings). Both now covered; CI also builds the daemon.

### Known limitations
- Win32 capture and geometry drivers (`windowCapture.ts`, `win32Driver.ts`) have not been run on real Windows hardware.
- The daemon cannot push tab sets to the extension (no bridge); see ROADMAP Phase 5.3.
- Terminal resurrection restores shell + directory only; no scrollback or git branch.
- Dashboard telemetry panel still shows demo statistics; `/api/clipboard`, `/api/ocr`, `/api/ai` endpoints it references do not exist on the daemon.
- `timeline.undo` and `provenance.export` RPC methods remain placeholders.

### Verification
`tsc -b`, `eslint .`, `npm run build:daemon` clean. New and existing tests that do not rely on `vi.mock` were executed with a stand-in runner in a Linux sandbox; the mocked suites (`daemon/__tests__/index.test.ts`, `rpcServer.test.ts`, `windowCapture.test.ts`, ...) and the Electron/Koffi suites need a real `npm test` on your machine.

## 1.0.0

First public release.

### Included
- Desktop Time Machine for Windows (Electron): window timeline, clipboard history, verified-focus Undo, checkpoints, 20 s auto-backup, activity stats, window privacy filter.
- Chrome MV3 extension: record, browse and rewind web sessions.
- React dev fixture for the timeline UI.

### Security hardening (pre-release audit)
- Overlay renderer sandboxed with context isolation, allow-listed IPC and a strict CSP.
- Restore requests are resolved from the main process timeline; renderer payloads are no longer trusted.
- Checkpoint ids are validated, closing a path-traversal hole in restore, delete and bundle import.
- State encryption now uses a random per-install key wrapped by the OS secure store instead of a username-derived key.

### Fixed
- Overlay header: search bar was crushed to a few pixels and its shortcut hint overlapped the tabs. Header now lays out correctly at every width; expanded window widened to 1100 px.
- Windows that merely lost focus were recorded as "closed". A window is now recorded as closed only when it no longer exists.
- Removed fabricated terminal history and scrollback that were being stored for terminals.
- "Jump Here" could fail with "Could not restore window geometry" for a real, already-installed app (seen with Chrome). The captured executable path could end up padded with trailing NUL characters from the native buffer, which silently broke the on-disk existence check. The path is now sanitized, and if it still can't be found, relaunch falls back to the same executable-name lookup Windows' own Start > Run uses.

### Known limitations
See the README section "Known limitations". Notably: no screen capture, game/battery guard not wired to live signals, no real OCR, shallow terminal resurrection, unencrypted backup exports, Tauri scaffold is experimental.
