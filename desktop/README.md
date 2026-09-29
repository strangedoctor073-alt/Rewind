# REWIND Desktop ↶

> **Local-First, Zero-Keylogging Time Machine & Universal Undo for Windows**  
> *Scrub back in time, resurrect closed apps & terminal sessions, export 5-second moments as GIFs, recover overwritten clipboards, and undo changes across any software.*

---

## 🌟 Key Capabilities

1. **Interactive Scrubbable Time Machine (Expanded Dashboard)**:
   - Press **`Ctrl+Alt+Z`** (or click **"Timeline"** on the floating HUD pill) to expand into an immersive, frosted-glass dashboard (`1100×520`).
   - Features a **horizontal filmstrip** displaying past window sessions, geometric layout schematics, relative timestamps ("Just now", "4m ago", "1h ago"), and deep state badges.
   - **`↶ Resurrect Shell / Jump Here`**: 1-click relaunch of closed applications with their window position restored. For terminals it reopens the shell executable in your home folder (scrollback and command-history capture are not implemented yet).

2. **1-Click 5-Second Animated GIF Exporter**:
   - Built-in pure-JS GIF89a encoder with infinite looping.
   - Click **`⚡ Export 5s GIF`** to turn the last 5 seconds of your window timeline into a shareable animated GIF of title cards (metadata only, not a screen recording) in your Downloads folder.

3. **Tactile Retro-Futuristic Audio Feedback**:
   - Synthesizes crisp mechanical tick sounds when scrolling through the timeline.
   - Plays a pneumatic retro-futuristic whoosh upon window/state resurrection.
   - Includes a one-click mute toggle (**`🔊 / 🔇`**) in the header that persists across sessions.

4. **Instant Timeline Search (`Ctrl+K`)**:
   - Filter your entire session history in real-time by process name, window title, document name, or keywords.
   - Searches a local text index of process names, window titles and saved state. This is not screen OCR.

5. **Ghost Shield (privacy filter)**:
   - Skips password managers (`1Password`, `Bitwarden`, `KeePass`, ...) and windows whose titles mention incognito / private browsing, passwords or sign-in.
   - Game and battery throttling logic exists in `gameGuard.js` but is **not yet wired to live system signals**.

6. **Privacy-Screened Clipboard Recovery**:
   - Tracks text copied during active app sessions, linking each snippet to the window context.
   - 1-click **Copy Back** to restore snippets overwritten hours ago.
   - Automatically redacts and blocks high-entropy tokens, API keys, private keys, and credit card numbers.

7. **Always-On-Top Floating Pill**:
   - Ultra-compact (`480×46`) translucent pill hovering seamlessly over VS Code, Chrome, Figma, Photoshop, Word, Terminal, etc.
   - Real-time active process badge, window title, pulsing recording indicator, and 20s auto-backup countdown.

8. **Universal Undo with Verified Focus Switching**:
   - Dispatches synthetic `Ctrl+Z` to the previous active application with a **500ms verified focus handshake**.
   - Interactive visual status: turns **green ("Undone!")** on success, or **red ("Failed")** with diagnostics if focus was blocked by Windows.

9. **20-Second Atomic WAL Crash Recovery**:
   - Checks dirty state every 20 seconds.
   - Flushes session history atomically (`.tmp` $\rightarrow$ atomic rename to `.wal`).
   - Sudden PC reboots, crashes, or power loss cause zero data loss — history is recovered automatically on launch.

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Launch REWIND Desktop
npm run desktop
```

The compact floating pill will appear at the top-center of your screen. You can drag it anywhere!

---

## ⌨️ Shortcuts & Controls

| Control | Shortcut | Action |
| :--- | :--- | :--- |
| **Time Machine** | `Ctrl + Alt + Z` | Expand / collapse full Time Machine dashboard |
| **Search History** | `Ctrl + K` | Focus instant search filter in Time Machine |
| **Scrub History** | `←` / `→` | Scrub filmstrip cards horizontally with tactile tick |
| **Close Dashboard** | `Esc` | Collapse Time Machine back to compact pill |
| **Sound Toggle** | `🔊 / 🔇` button | Toggle mechanical tick audio feedback on/off |
| **Export Moment** | `⚡ Export 5s GIF` | Save last 5 seconds of moments as an animated GIF |
| **Quick Undo** | HUD Undo button | Inject verified `Ctrl+Z` to active target app |
| **Privacy Pause** | HUD `⏸` button | Suspend recording and clipboard tracking for 15m |
| **Drag Pill** | Click & drag | Move HUD overlay to any monitor or screen edge |

---

## 🏗 Architecture

| Layer | Technology | Status |
| :--- | :--- | :--- |
| **Instant Prototype** | Electron + Koffi C FFI + Web Audio / CSS | Ready to run (`npm run desktop`) |
| **Native core (experimental)** | Tauri 2.0 (Rust) scaffold | `desktop/tauri/`, not built in CI, not supported |
| **Storage** | 20s atomic auto-backup; state blobs AES-256-GCM with an OS-protected key | Active |
| **Web Extension** | Chrome MV3 (DOM Recorder & Replay) | In `extension/` & `src/` |

---

## 🧪 Testing

```bash
# Run all unit and integration tests (53 passing tests)
npm test

# Run code linter (0 errors, 0 warnings)
npm run lint
```
