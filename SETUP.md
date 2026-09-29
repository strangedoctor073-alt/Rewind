# REWIND Setup & Development Guide ↶

This guide walks you through setting up, developing, testing, and building **REWIND** on your machine.

---

## Prerequisites

Before starting, ensure you have the following installed:

| Tool | Recommended Version | Notes |
| :--- | :--- | :--- |
| **Node.js** | `>= 18.0.0` (LTS recommended) | Verify with `node -v` |
| **npm** | `>= 9.0.0` | Verify with `npm -v` |
| **OS** | Windows 10 / 11 (64-bit) | For native Win32 window APIs and DPAPI-backed key storage |
| **Browser** | Google Chrome, Edge, Brave, or Arc | For loading the Manifest V3 extension |
| **Rust / Cargo** *(Optional)* | `>= 1.75` | Only needed if modifying `desktop/tauri/` native core |

---

## 🚀 Quick Setup (Under 2 Minutes)

### 1. Clone the Repository

```bash
git clone https://github.com/strangedoctor073-alt/Rewind.git
cd Rewind
```

### 2. Install Node Dependencies

```bash
npm install
```

This installs all dependencies including:
- **Runtime**: React 19, Electron, Koffi (zero-compilation Win32 FFI).
- **Tooling**: Vite, TypeScript, Vitest, ESLint, happy-dom.

---

## 🖥️ Running REWIND

REWIND can be run in three complementary modes depending on what you're working on:

### Mode A: REWIND Desktop Time Machine (System-Wide)

Runs the always-on-top floating HUD pill and full-screen Time Machine overlay across all PC software (VS Code, Chrome, Word, Photoshop, Windows Terminal, Discord):

```bash
npm run desktop
```

- **Global Shortcut**: Press <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Z</kbd> from any application to expand or collapse the Time Machine.
- **Search**: Press <kbd>Ctrl</kbd> + <kbd>K</kbd> to search past windows, commands, and documents.
- **Resurrect Terminal**: Click `↶ Resurrect Shell` on any closed terminal card to relaunch the terminal in your home folder (scrollback and history are not captured yet).
- **1-Click 5s GIF**: Click `⚡ Export 5s GIF` to save a title-card GIF of the past 5 seconds of your window timeline into your Downloads folder.
- **Tactile Sound**: Click the sound toggle `🔊 / 🔇` in the header to switch mechanical tick audio feedback on/off.

---

### Mode B: Chrome Extension (In-Browser DOM Interaction Recorder)

Records webpage interactions, user clicks, and scroll depth on active browser tabs with zero keylogging:

```bash
# Compile TypeScript and bundle the Timeline dashboard into extension/
npm run build:extension
```

#### Loading into Chrome / Edge / Brave:
1. Open your browser and navigate to `chrome://extensions/` (or `edge://extensions/`).
2. Toggle on **Developer mode** in the upper-right corner.
3. Click **Load unpacked**.
4. Select the `extension/` folder located inside the `Rewind` project directory.
5. Click the puzzle icon in your toolbar and pin **REWIND**.
6. Visit any website, click the REWIND extension icon, and select **Start recording**!

---

### Mode C: Web Component Dev Fixture (`src/`)

Runs a fast, hot-reloading Vite dev server to iterate on the React timeline UI, scrubber, and playback controls:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser. You can scrub history, test speed settings, and export `.rewind.json` files.

---

## 🧪 Testing & Quality Verification

Run the full automated test suite and linter before submitting pull requests:

```bash
# Run unit and integration tests (Vitest)
npm test

# Run ESLint across all JavaScript & TypeScript files
npm run lint

# Run TypeScript typechecks across app and extension configs
npx tsc -b
```

All 70 automated tests should pass with 0 errors and 0 warnings.

---

## 📂 Project Directory Structure

```text
REWIND/
├── desktop/                  # Desktop Time Machine & system-wide engines
│   ├── overlay/              # Always-on-top floating HUD (HTML, CSS, JS)
│   ├── tauri/                # Experimental Rust scaffold (not built in CI)
│   ├── stateCapture.js       # Deep terminal state & 5 MiB compression engine
│   ├── audioEngine.js        # Synthesized mechanical tick & pneumatic audio
│   ├── gifExporter.js        # Pure-JS GIF89a 5-second moment exporter
│   ├── ocrEngine.js          # Local text index for timeline search (not real OCR)
│   ├── gameGuard.js          # Battery & 3D game capture throttling / ghost shield
│   ├── undoEngine.js         # Tri-tier universal undo & focus verification
│   ├── clipboardEngine.js    # Privacy-screened clipboard history manager
│   ├── backupEngine.js       # 20-second atomic WAL auto-backup engine
│   ├── win32.js              # Native Win32 FFI bindings (Koffi)
│   ├── security.js           # Credential & password manager blackout filter
│   ├── main.js               # Desktop Electron runtime entrypoint
│   └── __tests__/            # Desktop engine unit & integration tests
│
├── extension/                # Packaged Chrome Extension (MV3)
│   ├── manifest.json         # Manifest V3 extension configuration
│   ├── background.js         # Service worker session indexer
│   ├── content.js            # DOM interaction & scroll depth recorder
│   ├── popup.html / popup.js # Extension toolbar menu
│   └── timeline.html         # In-browser split-pane replay viewer
│
├── extension-src/            # React 19 source for extension Timeline
├── src/                      # React 19 source for web dev fixture
├── public/                   # Static SVG icons and assets
├── ARCHITECTURE.md           # High-level architecture and security spec
├── CODE_OF_CONDUCT.md        # Contributor Covenant v2.1
├── CONTRIBUTING.md            # Pull request and coding guidelines
├── LICENSE                   # MIT License
├── package.json              # Scripts and npm dependencies
├── SETUP.md                  # This setup file
└── vite.config.ts            # Vite build configuration
```

---

## 🛠️ Troubleshooting

### 1. `koffi` fails to load or native FFI warning
`koffi` bundles pre-compiled binaries for Windows x64. If you encounter permissions issues, ensure you are running in a regular non-sandboxed terminal with write access to `node_modules`.

### 2. Global Hotkey (`Ctrl+Alt+Z`) not triggering
If another application (such as an IDE or graphics editor) has already globally registered `Ctrl+Alt+Z`, close the competing application or click the `⏱ Timeline` button on the floating HUD pill.

### 3. Extension shows "Cannot access chrome:// or file:// URLs"
Chrome's security policy prevents extensions from injecting content scripts into `chrome://`, `chrome-extension://`, or the Chrome Web Store. Test on standard HTTP/HTTPS websites (e.g. `https://github.com` or `http://localhost:5173`).

---

## 📄 License & Conduct

- **License**: Released under the [MIT License](LICENSE).
- **Code of Conduct**: We adhere to the [Contributor Covenant v2.1](CODE_OF_CONDUCT.md).
