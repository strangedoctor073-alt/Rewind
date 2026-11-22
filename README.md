# REWIND ↶

A local-first Windows activity time machine, app-level undo hotkey, and browser interaction recorder.

[![CI Status](https://img.shields.io/github/actions/workflow/status/strangedoctor073-alt/Rewind/ci.yml?branch=main&style=flat-square&label=CI)](https://github.com/strangedoctor073-alt/Rewind/actions)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Chrome%20MV3-blue?style=flat-square)
![Tests](https://img.shields.io/badge/Tests-284%20passed-success?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

---

## What It Is

REWIND captures local window activity, tracks process geometry, and lets you rewind activity, resurrect closed workspaces, and record browser interactions. Everything is stored locally on your machine with zero cloud dependencies.

- **Desktop Shell (`desktop/`)**: Electron app with Koffi Win32 FFI bindings (`PrintWindow`, `QueryFullProcessImageNameW`, `SetForegroundWindow`). Features an always-on-top floating HUD pill toggled globally with `Ctrl+Alt+Z`.
- **Background Daemon (`daemon/`)**: Headless Node/TypeScript service with embedded SQLite in WAL mode, FTS5 full-text search, and dual-transport JSON-RPC over Named Pipes (`\\.\pipe\rewind-daemon-rpc`) and TCP (`48291`).
- **Browser Extension (`extension/`)**: Chrome Manifest V3 extension that records DOM clicks, inputs, and scrolls with client-side credential masking (passwords, credit cards).
- **Studio Dashboard (`src/dashboard/`)**: Chronological timeline interface to search, inspect past moments, and preview workspace restoration.

---

## Engineering Details

- **Win32 String Sanitization**: Native process paths from `QueryFullProcessImageNameW` are sanitized to strip trailing null bytes (`\0`) before filesystem lookups.
- **Terminal Protection**: App-level `Ctrl+Z` undo dispatches only after a verified 500ms window focus handshake; terminal processes are excluded to avoid sending `SIGTSTP` / `0x1A`.
- **Atomic Persistence**: Auto-backup engine writes dumps to `.tmp` files first, performing an atomic rename (`fs.renameSync`) every 20 seconds to prevent WAL corruption.
- **Encrypted Vaults**: Timeline exports are encrypted using AES-256-GCM with PBKDF2 key derivation (600,000 iterations). State blobs use Windows DPAPI via Electron `safeStorage`.
- **Zero Keylogging**: Never uses global keyboard hooks (`WH_KEYBOARD_LL`). Capture is restricted to window focus events and explicit in-browser DOM events.

---

## Quick Start

Requirements: Node.js 20.19+ on Windows.

```bash
# 1. Install dependencies
npm install

# 2. Run the Desktop Time Machine (Electron HUD)
npm run desktop

# 3. Build & load the Chrome Extension
npm run build:extension
# Load unpacked 'extension/' directory in chrome://extensions/

# 4. Run Studio Dashboard (Web)
npm run dev

# 5. Run Headless Daemon & CLI
npm run build:daemon
node bin/rewind.js start
node bin/rewind.js status
```

---

## Shortcuts

| Shortcut | Surface | Action |
|---|---|---|
| `Ctrl + Alt + Z` | Global | Toggle Time Machine HUD |
| `Ctrl + K` | Time Machine | Search past windows & moments |
| `Esc` | Time Machine | Close overlay |
| `j` / `k` (or `↓` / `↑`) | Extension | Navigate events |
| `Enter` | Extension | Rewind to event |

---

## Tests & Verification

```bash
npm test          # 284 tests across 41 suites (Vitest, 100% passing)
npm run lint      # ESLint (0 errors, 0 warnings)
npx tsc -b        # Composite TypeScript typecheck
npm run build     # Production build
```

---

## License

MIT © Rohan Gupta
