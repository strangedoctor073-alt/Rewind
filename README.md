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

## Choose Your Mode

| Mode | Target | Status | How to Launch |
| :--- | :--- | :--- | :--- |
| **REWIND Desktop Time Machine** | Windows: window-activity timeline, clipboard history, undo hotkey | **v1, Windows 10/11 only** | `npm run desktop` |
| **REWIND Web Extension** | Active browser tab interactions & DOM replay | **v1, Chromium MV3** | `npm run build:extension` |
| **React Dev Fixture** | Interactive scrubber, speed controls & replay testing | Demo / test fixture | `npm run dev` |

---

## What it actually does

**Desktop Time Machine (Windows)**

- **Window timeline.** Records which app and window title had focus, and when a window disappeared, with its size and position. Press `Ctrl+Alt+Z` to scrub through it. *It stores metadata, not screenshots or video.*
- **Relaunch closed apps.** `Jump Here` relaunches a closed app and restores its window position. `Resurrect Shell` reopens the terminal executable in your home folder.
- **Clipboard history.** A privacy-filtered history of text you copied, so an overwritten clipboard is recoverable.
- **Universal Undo.** Sends `Ctrl+Z` to the active app only after verifying that window really has focus (500 ms handshake).
- **Checkpoints & backups.** Named checkpoints, plus an automatic backup every 20 s written atomically for crash recovery.
- **Activity stats.** Local focus score, context-switch rate and per-app time. Nothing leaves your machine.
- **Privacy filter.** Skips known password managers and windows whose titles mention incognito / private browsing, passwords or sign-in.
- **5-second GIF.** Exports the last 5 seconds of the timeline as a small animated GIF of title cards (not a screen recording).

**Browser extension** records clicks, inputs (with sensitive fields masked), scrolls and navigation on any http(s) page and lets you browse and rewind the session.

## Known limitations (read before you rely on it)

We would rather you hear this from us than find out later.

- **No screen capture.** REWIND does not record pixels. The filmstrip and the GIF export are built from window metadata (process, title, geometry), not screenshots.
- **"Search" is a text index, not OCR.** `Ctrl+K` searches process names, window titles and saved state. It does not read text off your screen.
- **Terminal resurrection is shallow.** It relaunches the terminal executable in your home folder. Scrollback, command history and the real working directory are **not** captured yet.
- **Encryption scope.** Saved state blobs use AES-256-GCM with a random per-install key protected by the OS secure store (DPAPI on Windows). If the OS store is unavailable, a weak fallback key is used and a warning is logged. `.rewind.backup` exports and checkpoints are **plain JSON**: treat them as sensitive files.
- **Game and battery guards are not live.** `gameGuard.js` implements the logic (and is unit-tested), but the app does not yet feed it real full-screen-game or battery signals, so capture is never paused for those reasons.
- **Windows only.** The Electron app needs Win32 APIs. Unit tests mock Win32 and run on Linux CI; verify on a real Windows machine with [MANUAL_TESTING.md](MANUAL_TESTING.md).
- **Tauri is an experimental scaffold** in `desktop/tauri/`. It is not built in CI and is not a supported way to run REWIND.
- **No performance benchmarks are published.** Idle CPU and search latency have not been measured.

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
