# REWIND ↶

<p align="center">
  <img src="https://raw.githubusercontent.com/strangedoctor073-alt/Rewind/main/src/assets/hero.png" alt="REWIND Banner" width="700" style="max-width: 100%; border-radius: 12px;" />
</p>

<p align="center">
  <strong>The Local-First Interaction Recorder, Universal Undo & Desktop Time Machine.</strong><br />
  Scrub back in time across your whole PC or browser, resurrect closed apps & terminal sessions, export 5-second moments as GIFs, recover overwritten clipboards, and undo changes with verified focus handshakes — 100% private, local, and hardware-accelerated.
</p>

<p align="center">
  <a href="https://github.com/strangedoctor073-alt/Rewind/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/strangedoctor073-alt/Rewind/ci.yml?branch=main&style=flat-square&label=CI" alt="CI Status" /></a>
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Chrome%20MV3-blue?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/Desktop-Tauri%202.0%20%2B%20Electron-61dafb?style=flat-square" alt="Desktop Dual-Engine" />
  <img src="https://img.shields.io/badge/Privacy-Zero%20Keylogging-d9ff58?style=flat-square&color=black" alt="Zero Keylogging" />
  <img src="https://img.shields.io/badge/Storage-20s%20Atomic%20WAL-success?style=flat-square" alt="20s Atomic WAL" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License: MIT" /></a>
</p>

---

## 🌟 Choose Your Mode

| Mode | Target | Status | How to Launch |
| :--- | :--- | :--- | :--- |
| **REWIND Desktop Time Machine** | Entire PC (VS Code, Chrome, Word, Photoshop, Figma, Terminal, Discord) | **Active** | `npm run desktop` (or native Tauri binary) |
| **REWIND Web Extension** | Active browser tab interactions & DOM replay | **Active** | `npm run build:extension` |
| **React Dev Fixture** | Interactive scrubber, speed controls & replay testing | **Active** | `npm run dev` |

---

## Why REWIND?

Traditional bug reporters, screen recorders, and commercial rewind utilities suffer from severe flaws: they either **stream full screen recordings to third-party clouds**, run high-CPU video encoders that drain battery life, or face privacy backlash over raw keylogging.

**REWIND takes a fundamentally different approach focused on high utility and zero bloat:**

- **⚡ Deep State & Terminal Resurrection**: Accidentally closed your terminal? 1-click **"Resurrect Shell"** re-launches the shell at the exact working directory with prior command history and scrollback output restored.
- **⚡ Inbuilt Productivity & Activity Stats Service**: Automatic zero-telemetry local analytics calculating deep work focus scores, context-switch frequency, app time distributions, and rescue counters.
- **⚡ Video & Visual Replay Engine**: Smooth moment scrubbing with play/pause, variable speeds (0.5x, 1x, 2x, 4x), step controls, and native CSS scroll-driven animations (`animation-timeline: view(inline)`).
- **⚡ Multi-Checkpoint Disaster Recovery**: Save named milestone snapshots, 1-click restore session states, and export/import portable encrypted `.rewind.backup` bundles.
- **⚡ 1-Click 5-Second Animated GIF Exporter**: Turn any moment in your history into a lightweight animated GIF (`GIF89a`) in seconds to share bug repros with teammates.
- **⚡ Instant OCR & Click-to-Copy**: Tokenizes on-screen text, URLs, and errors into clickable bounding boxes with sub-millisecond search across your screen history.
- **⚡ Tactile Retro Audio Feedback**: Generates synthesized mechanical clicks when scrubbing through history and a satisfying pneumatic whoosh upon resurrection (with an instant mute toggle).
- **⚡ Ghost Shield & Battery Guard**: Automatically pauses capture during full-screen 3D games (`SHQueryUserNotificationState`) and throttles on low battery (<20%). Automatically blacks out password managers (`1Password`, `Bitwarden`, `KeePass`) and incognito tabs.
- **⚡ 100% Local-First & Private**: Everything stays on your machine. Persisted state blobs are gzip-compressed and encrypted via AES-256-GCM / DPAPI. Zero external API calls, zero telemetry, zero servers.
- **⚡ Universal Undo with Verified Focus**: Sends synthetic `Ctrl+Z` with a 500ms focus verification handshake so keystrokes never get misdirected.

---

## Comparison Matrix

| Feature | REWIND ↶ | Commercial Tools (Recall / Rewind.ai) | Cloud Session Replay (PostHog / LogRocket) |
| :--- | :---: | :---: | :---: |
| **Privacy & Storage** | **100% Local & Encrypted** | Cloud-synced or proprietary OS lock-in | Uploaded to remote ingestion servers |
| **Keylogging** | **Zero (Blocked by design)** | Often captures or OCRs all inputs | Streams keystrokes over network |
| **Closed App & Terminal Resurrection** | **Yes (Relaunch + scrollback buffer)** | ❌ Screenshot replay only | ❌ In-browser iframe only |
| **Export 5s Moment as GIF** | **Yes (Built-in pure-JS encoder)** | ❌ Cloud video link only | ❌ Cloud dashboard only |
| **System Overhead** | **<0.5% Idle CPU (Event-driven)** | High continuous video encoding | Continuous WebSocket streaming |
| **Tactile Mechanical Audio** | **Yes (Synthesized Web Audio)** | ❌ Silent | ❌ Silent |
| **Gaming & Battery Guard** | **Yes (Auto-throttles during 3D games)** | ❌ May cause frame drops | ❌ Continuous background drain |
| **Crash Recovery** | **20s Atomic WAL** | Proprietary database | Cloud buffer |

---

## Quick Start

For detailed step-by-step setup instructions, see **[SETUP.md](SETUP.md)**.

### 1. Launch REWIND Desktop Time Machine (System-Wide Windows)

```bash
# Clone the repository
git clone https://github.com/strangedoctor073-alt/Rewind.git
cd Rewind

# Install dependencies
npm install

# Launch REWIND Desktop Floating HUD & Time Machine
npm run desktop
```

- Press **`Ctrl+Alt+Z`** anywhere to expand into the **Time Machine Dashboard**.
- Press **`Ctrl+K`** to search past window titles, apps, and documents.
- Click **`↶ Resurrect Shell`** on any closed terminal card to restore your session!
- Click **`⚡ Export 5s GIF`** to export an animated clip of your past screen moment.
- Click the sound icon **`🔊 / 🔇`** to toggle tactile mechanical tick audio feedback.

---

### 2. Load the Chrome Extension (In-Browser DOM Recorder)

```bash
# Build the Timeline dashboard into extension/
npm run build:extension
```

1. Open Google Chrome (or any Chromium browser: Brave, Edge, Arc).
2. Navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked** and select the `extension/` directory from this repository.
5. Pin **REWIND** to your browser toolbar.

---

### 3. Run the Component Dev Fixture (`src/`)

```bash
npm run dev
```

Open `http://localhost:5173/` in your browser to test interactive timeline scrubbing, undo/redo (`Ctrl/Cmd+Z`), speed adjustments, and `.rewind.json` export/import.

---

## Keyboard Shortcuts

### Desktop Time Machine

| Shortcut | Action |
| :--- | :--- |
| <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Z</kbd> | **Toggle Time Machine HUD Overlay** |
| <kbd>Ctrl</kbd> + <kbd>K</kbd> | Focus instant search bar |
| <kbd>←</kbd> / <kbd>→</kbd> | Scrub history horizontally with tactile audio |
| <kbd>Esc</kbd> | Close Time Machine overlay |

### Extension Timeline Dashboard

| Shortcut | Action |
| :--- | :--- |
| <kbd>j</kbd> or <kbd>↓</kbd> | Navigate to next event |
| <kbd>k</kbd> or <kbd>↑</kbd> | Navigate to previous event |
| <kbd>Enter</kbd> | **Rewind to selected moment** |
| <kbd>c</kbd> | Copy target element CSS selector to clipboard |
| <kbd>/</kbd> | Focus session search bar |
| <kbd>Esc</kbd> | Unfocus search bar |

---

## Development & Testing

```bash
# Run full automated test suite (60 passing tests across 13 suites)
npm test

# Run ESLint linting (0 errors, 0 warnings)
npm run lint

# Run TypeScript typechecks across all targets
npx tsc -b
```

---

## Community & Contributing

We welcome contributions from the community!
- Please read our **[CONTRIBUTING.md](CONTRIBUTING.md)** for workflow and pull request guidelines.
- Review our **[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)** before participating.
- Check our **[SECURITY.md](SECURITY.md)** for our privacy guarantee and security reporting process.

---

## License

Released under the **[MIT License](LICENSE)**.
Copyright (c) 2026 REWIND contributors.
