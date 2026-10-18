# REWIND ↶

<p align="center">
  <img src="https://raw.githubusercontent.com/strangedoctor073-alt/Rewind/main/src/assets/hero.png" alt="REWIND Banner" width="700" style="max-width: 100%; border-radius: 12px;" />
</p>

<p align="center">
  <strong>A local-first window-activity timeline, universal-undo hotkey and in-browser interaction recorder.</strong><br />
  Jump back through the apps and windows you used, relaunch what you closed, recover clipboard text you overwrote, and record &amp; replay web sessions. Everything stays on your machine.
</p>

<p align="center">
  <a href="https://github.com/strangedoctor073-alt/Rewind/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/strangedoctor073-alt/Rewind/ci.yml?branch=main&style=flat-square&label=CI" alt="CI Status" /></a>
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Chrome%20MV3-blue?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/Desktop-Electron%20(Windows)-61dafb?style=flat-square" alt="Desktop: Electron on Windows" />
  <img src="https://img.shields.io/badge/Privacy-Zero%20Keylogging-d9ff58?style=flat-square&color=black" alt="Zero Keylogging" />
  <img src="https://img.shields.io/badge/Backups-20s%20auto--save-success?style=flat-square" alt="20s Atomic WAL" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License: MIT" /></a>
</p>

---

## What's New in REWIND v5.0 ⚡

- **Workspace Time Machine**: from any moment, reopen the VS Code / Cursor files, Windows Terminal directories and browser tabs you had open, with windows placed back where they were (clamped to your current monitors). `rewind resurrect <momentId> --dry-run` previews it; the dashboard has **⚡ Resurrect Workspace** and **Preview** buttons.
- **Dashboard now talks to the daemon**: an authenticated loopback HTTP bridge (`127.0.0.1:48292`). Run `rewind token` and paste it via **🔑 Pair with daemon**.
- **Daemon fixes**: `rewind start` actually starts it (`npm run build:daemon` first), Windows capture works, Ghost Shield applies to capture, retention purges old data.
- Full list of fixes and known limitations: [CHANGELOG.md](CHANGELOG.md).

## What Was New in REWIND v2.0

- **Headless Background Daemon & CLI (`rewind`)**: Run completely headless in the background with JSON-RPC over Named Pipes and TCP. Full control via `rewind start/stop/status/capture/search/autostart`.
- **Native Framebuffer Capture & 64-bit dHash**: Captures window framebuffers via Win32 `PrintWindow` with gradient difference hashing to eliminate idle duplicate frames.
- **SQLite + FTS5 Full-Text Search**: Embedded, zero-cloud timeline database with instant sub-millisecond search across applications, OCR tokens, and browser DOM events.
- **Grand Dashboard Studio**: Cyber-minimalist visual node graph powered by `@xyflow/react`, Filmstrip scrubber, Curtain Diff visual comparator, and `Ctrl+K` Omnibox.
- **Procedural Web Audio Engine**: Zero-asset procedural oscillator synthesizer for mechanical ticks, sweeps, and hotkey feedback.
- **Stability & Anti-Freeze Hardening**: Native `IsHungAppWindow` protection so deadlocked target applications never lock up REWIND.

---

## Choose Your Surface

| Mode | Purpose | Command |
| :--- | :--- | :--- |
| **REWIND CLI & Daemon** | Headless background capture, SQLite search, and autostart | `npm run cli -- help` or `rewind start` |
| **Grand Dashboard Studio** | Interactive node graph, Curtain Diff, and Filmstrip | `npm run dev` |
| **Desktop Floating HUD** | Always-on-top pill and overlay with universal undo | `npm run desktop` |
| **Chrome MV3 Extension** | Browser DOM interaction recorder & scroll restoration | `npm run build:extension` |

---

## What It Does

**1. Headless Daemon & Local Storage (`daemon/`)**
- Runs in the background, recording window switches, active window bounds, and git branch context.
- Stores historical events in SQLite (`%LOCALAPPDATA%\Rewind\timeline.db`) in WAL mode with FTS5 search.
- Dual-transport RPC server (`127.0.0.1:48291` and `\\.\pipe\rewind-daemon-rpc`, newline-delimited JSON-RPC, not HTTP) protected by 256-bit authentication tokens, plus an authenticated HTTP bridge on `127.0.0.1:48292` for the dashboard.
- Start it with `npm run build:daemon && rewind start` (or `npm run daemon` to run it in the foreground and see errors).

**2. Desktop Time Machine (`desktop/`)**
- Floating HUD pill expandable to a full Time Machine dashboard via global `Ctrl+Alt+Z`.
- Relaunch closed applications with preserved positions; resurrect terminal sessions.
- Universal Undo (`Ctrl+Z`) verified with a 500ms foreground switch handshake.
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

- No network calls, no telemetry, no accounts. The overlay's Content-Security-Policy blocks all network access.
- No keylogging: the app never installs keyboard hooks. The only keystroke it sends is a synthetic `Ctrl+Z` for Undo.
- The overlay window is sandboxed (context isolation on, Node integration off) and can only talk to the main process through an allow-listed bridge. The main process resolves restore requests from its own timeline instead of trusting the renderer.
- See [SECURITY.md](SECURITY.md) for how to report a vulnerability.

---

## Development & Testing

```bash
npm test          # 70 tests across 15 suites (Vitest)
npm run lint      # ESLint
npm run build     # typecheck + web build
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
