# REWIND ↶

<p align="center">
  <img src="https://raw.githubusercontent.com/strangedoctor073-alt/Rewind/main/src/assets/hero.png" alt="REWIND Banner" width="700" style="max-width: 100%; border-radius: 12px;" />
</p>

<p align="center">
  <strong>A local-first window-activity timeline, app-level undo hotkey, and in-browser interaction recorder.</strong><br />
  Browse your local activity timeline, preview workspace restoration, and record &amp; replay browser interactions. Restoration is best-effort and depends on the recorded app and available files; everything stays on your machine.
</p>

<p align="center">
  <a href="https://github.com/strangedoctor073-alt/Rewind/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/strangedoctor073-alt/Rewind/ci.yml?branch=main&style=flat-square&label=CI" alt="CI Status" /></a>
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Chrome%20MV3-blue?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/Desktop-Electron%20(Windows)-61dafb?style=flat-square" alt="Desktop: Electron on Windows" />
  <img src="https://img.shields.io/badge/Storage-Local--First%20SQLite-blue?style=flat-square" alt="Local-First SQLite" />
  <img src="https://img.shields.io/badge/Backups-20s%20auto--save-success?style=flat-square" alt="20s Atomic WAL" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License: MIT" /></a>
</p>

---

## What's New in REWIND v6.0

- **Workspace Restore Preview**: Inspect the apps, files, and browser tabs REWIND can reopen before launching them (`rewind resurrect <momentId> --dry-run` or Studio **Preview**). Restore remains best-effort: terminal recovery reopens a directory, not command output or shell history.
- **Automated Macro Exporters (Labs)**:
  - `rewind macro export --format playwright --output flow.spec.ts`: Turn recorded web sessions into clean, runnable Playwright tests with automatic environment-variable secret masking (`process.env.SECRET`).
  - `rewind macro export --format powershell --output script.ps1`: Generate idempotent PowerShell automation with elevation checks and secure string masking.
- **Cognitive Standup & AI Synthesizer (Labs)**: Generate daily standup summaries, timesheet activity logs, and commit drafts powered by Ollama (`ai.standup` RPC with heuristic offline fallback). Requires a running local Ollama instance on port 11434.
- **Focus & Productivity Insights**: Focus score, context-switch data, and activity reports appear only when returned by the local daemon; the UI shows an explicit no-report state otherwise.
- **Timeline-first Studio**: Searchable chronological activity is the primary view. Graph, Filmstrip, Compare, and Insights remain available as alternate views over recorded data.
- **Client-Side Encrypted Timeline Vaults**: `rewind vault create <file.vault>` / `rewind vault restore <file.vault>` — AES-256-GCM + PBKDF2 (600k rounds per OWASP guidelines) encrypted timeline backups with gzip compression.
- **Fail-Closed State Encryption**: State blobs use OS-protected keys (Electron `safeStorage` / DPAPI on Windows). The system refuses to store sensitive state if the secure store is unavailable rather than degrading to weak obfuscation.
- Full detailed evolution and fixes: [CHANGELOG.md](CHANGELOG.md).


## What Was New in REWIND v2.0

- **Headless Background Daemon & CLI (`rewind`)**: Run completely headless in the background with JSON-RPC over Named Pipes and TCP. Full control via `rewind start/stop/status/capture/search/autostart`.
- **Native Framebuffer Capture & 64-bit dHash**: Captures window framebuffers via Win32 `PrintWindow` with gradient difference hashing to eliminate idle duplicate frames.
- **SQLite + FTS5 Full-Text Search**: Embedded, zero-cloud timeline database with fast full-text search across applications and browser DOM events.
- **Grand Dashboard Studio**: Searchable chronological timeline first, with optional `@xyflow/react` Graph, Filmstrip, Compare, and `Ctrl+K` search.
- **Procedural Web Audio Engine**: Zero-asset procedural oscillator synthesizer for mechanical ticks, sweeps, and hotkey feedback.
- **Stability & Anti-Freeze Hardening**: Native `IsHungAppWindow` protection so deadlocked target applications never lock up REWIND.

---

## Choose Your Surface

| Mode | Purpose | Command |
| :--- | :--- | :--- |
| **REWIND CLI & Daemon** | Headless background capture, SQLite search, and autostart | `npm run cli -- help` or `rewind start` |
| **Grand Dashboard Studio** | Timeline-first activity history, Graph, Filmstrip, Compare, and Insights | `npm run dev` |
| **Desktop Floating HUD** | Always-on-top pill and overlay with app-level undo | `npm run desktop` |
| **Chrome MV3 Extension** | Browser DOM interaction recorder & scroll restoration | `npm run build:extension` |

---

## What It Does

**1. Headless Daemon & Local Storage (`daemon/`)**
- Runs in the background, recording window switches, active window bounds, and git branch context.
- Stores historical events in SQLite (`%LOCALAPPDATA%\Rewind\timeline.db`) in WAL mode with FTS5 search.
- Dual-transport RPC server (`127.0.0.1:48291` and `\\.\pipe\rewind-daemon-rpc`, newline-delimited JSON-RPC, not HTTP) protected by 256-bit authentication tokens, plus an authenticated HTTP bridge on `127.0.0.1:48292` for the dashboard and extension.
- Start it with `npm run build:daemon && rewind start` (or `npm run daemon` to run it in the foreground and see errors).

**2. Desktop Time Machine (`desktop/`)**
- Floating HUD pill expandable to a full Time Machine dashboard via global `Ctrl+Alt+Z`.
- Relaunch closed applications with preserved positions; resurrect terminal sessions in their last working directory (shell history and command outputs are not restored).
- App-Level Undo (`Ctrl+Z`) verified with a 500ms foreground switch handshake (terminal processes excluded to prevent sending break/suspend signals).
- 20-second atomic WAL auto-backup and encrypted snapshot export.

**3. In-Browser Interaction Recording (`extension/`)**
- Records clicks, inputs (with passwords and credit cards masked), and scrolls on any http(s) page.
- In-memory event batch queue with debounced storage flushes to eliminate disk thrashing.

---

---

## Quick Start

For detailed setup, see **[SETUP.md](SETUP.md)**. Requires Node.js 20.19+ (CI uses 22).

### 1. Desktop Time Machine (Windows)

```bash
git clone https://github.com/strangedoctor073-alt/Rewind.git
cd Rewind
npm install
npm run desktop
```

- Press **`Ctrl+Alt+Z`** anywhere to open or close the Time Machine.
- Press **`Ctrl+K`** (with the Time Machine open) to search windows, apps and titles.
- Click **`Resurrect Shell`** / **`Jump Here`** on a closed-window card to relaunch it.
- Click **`Export 5s GIF`** to save a title-card GIF to your Downloads folder.
- Click the speaker icon to toggle the scrub sound.

### 2. Chrome extension

```bash
npm run build:extension
```

1. Open `chrome://extensions/` in Chrome or any Chromium browser.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/` directory.
4. Pin **REWIND** to your toolbar.

### 3. Component dev fixture

```bash
npm run dev
```

Open `http://localhost:5173/` to try timeline scrubbing, undo/redo (`Ctrl/Cmd+Z`), speed controls and `.rewind.json` export/import.

---

## Keyboard Shortcuts

### Desktop Time Machine

| Shortcut | Action |
| :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Z</kbd> | Toggle the Time Machine overlay (global) |
| <kbd>Ctrl</kbd> + <kbd>K</kbd> | Focus the search bar |
| <kbd>←</kbd> / <kbd>→</kbd> | Step through moments |
| <kbd>Esc</kbd> | Close the overlay |

### Extension Timeline Dashboard

| Shortcut | Action |
| :--- | :--- |
| <kbd>j</kbd> or <kbd>↓</kbd> | Next event |
| <kbd>k</kbd> or <kbd>↑</kbd> | Previous event |
| <kbd>Enter</kbd> | Rewind to selected moment |
| <kbd>c</kbd> | Copy target element CSS selector |
| <kbd>/</kbd> | Focus session search bar |
| <kbd>Esc</kbd> | Unfocus search bar |

---

## Privacy & security model

- **Zero External Network Calls**: No telemetry, no cloud servers, no user accounts. Internal communication is strictly restricted to local loopback interfaces (`127.0.0.1:48291` JSON-RPC and `127.0.0.1:48292` HTTP bridge, plus optional local Ollama on `127.0.0.1:11434`). The overlay's Content-Security-Policy blocks all network access (`connect-src 'none'`). Note: Loopback connections are local network sockets; the extension communicates with the daemon via this loopback HTTP bridge.
- **No Global Keylogging**: The desktop application never installs global OS keyboard hooks (`WH_KEYBOARD_LL`). The only synthetic keystroke REWIND dispatches is `Ctrl+Z` to trigger application-level Undo after focus verification (terminals and shells are excluded).
- **Extension Input Recording & Masking**: The browser extension records user interactions in active tabs into `chrome.storage.local`. Sensitive form inputs (passwords, credit card numbers, CVVs, SSNs, 2FA/OTP tokens) are masked (`[masked]`) via best-effort heuristic denylists. Plaintext credentials should never be typed into custom unmasked fields during recorded sessions.
- **Screenshots & Window Framebuffers**: When capture is enabled, window framebuffer previews are captured via Win32 `PrintWindow` for thumbnail previews and perceptual hashing (dHash). All frame data is stored locally in the user data directory and is never transmitted off-device.
- **Fail-Closed State Encryption**: Saved state blobs are encrypted with AES-256-GCM using keys protected by the OS secure store (Electron `safeStorage` / DPAPI on Windows). If the secure store is unavailable, REWIND fails closed rather than degrading to weak fallback obfuscation.
- **Sandboxed Overlay**: The overlay renderer is sandboxed (`contextIsolation: true`, `nodeIntegration: false`) and communicates only through an allow-listed IPC bridge. The main process resolves restore requests from its own internal timeline.
- See [SECURITY.md](SECURITY.md) for vulnerability reporting and detailed security architecture.

---

## Known Limitations

- **Windows Platform Requirement**: The desktop capture engine relies on Win32 FFI via Koffi and Windows-specific system APIs (`GetWindowTextW`, `PrintWindow`, `QueryFullProcessImageNameW`). Linux and macOS desktop capture is not currently supported; the test suite mocks these Win32 APIs for cross-platform CI verification.
- **No Shell Output or History Resurrection**: Resurrecting a terminal or shell window re-opens the terminal executable in the recorded working directory. Terminal scrollback history, command outputs, active REPLs, and background subprocesses cannot be re-instantiated.
- **Best-Effort Window Placement**: Multi-monitor geometry restoration maps window coordinates across monitors. Because DPI scale factors, taskbars, and virtual desktop configurations vary, resurrected windows may occasionally be repositioned by Windows OS window managers.
- **Undo is Target-Dependent**: Universal Undo sends synthetic `Ctrl+Z` to the verified target application. If the target application does not implement Undo or handles `Ctrl+Z` differently, REWIND cannot force an undo. Terminals and consoles are explicitly excluded to prevent sending ASCII `0x1A` (substitute / SIGTSTP).
- **Heuristic Privacy Masking**: Extension field masking uses regex and attribute heuristics. Custom web inputs (e.g., canvas-based or custom web components without standard accessibility attributes) might not trigger masking. Do not record while entering sensitive passwords or credentials.

---

## Development & Testing

```bash
npm test          # 269 tests across 39 suites (Vitest)
npm run lint      # ESLint (0 errors, 0 warnings)
npm run build     # typecheck + web build
npm run build:daemon
npm run build:extension
```

---

## Community & Contributing

- Read **[CONTRIBUTING.md](CONTRIBUTING.md)** for workflow and pull request guidelines.
- Review the **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** before participating.
- Check **[SECURITY.md](SECURITY.md)** for the security policy and reporting process.
- Release notes live in **[CHANGELOG.md](CHANGELOG.md)**.

---

## License

Released under the **[MIT License](LICENSE)**.
Copyright (c) 2026 REWIND contributors.
