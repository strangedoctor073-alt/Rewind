# AGENTS.md — Instructions & Gotchas for AI Agents

Welcome to **REWIND**. This repository is a local-first system activity timeline, universal undo, and browser interaction recorder.

This document outlines key architectural invariants, build conventions, and **subtle traps/gotchas that agents easily miss or forget**.

---

## 1. High-Level Subsystem Boundaries

The codebase is divided into **three distinct subsystems**. Do NOT conflate them or assume they share a single unified data schema:

| Directory | Subsystem | Purpose & Runtime | Key Schema |
| :--- | :--- | :--- | :--- |
| `desktop/` | **Desktop Time Machine** | Electron + Koffi (Win32 FFI) capturing Windows activity, floating HUD pill, and 20s atomic WAL. | `WindowMoment`, `ClipboardHistory`, `FullStateCapture` |
| `extension-src/` | **Chrome MV3 Extension** | Source code for browser interaction recording (clicks, inputs, scrolls, tabs). | `BrowserRecording`, `BrowserRecordingEvent` |
| `extension/` | **Extension Distributable** | Unpacked extension directory loaded into Chromium browsers (`chrome://extensions`). | Generated output + extension manifest |
| `src/` | **Web Dev Fixture** | Standalone Vite + React fixture for testing scrubber UI and replay state. | `RecordingEvent`, `ReplaySnapshot` |
| `desktop/tauri/` | **Native Rust Scaffold** | Experimental scaffold. **Not built in CI, not the primary runtime.** Do not depend on it for current tests. | Rust structs |

---

## 2. Things Agents Easily Miss or Forget (Critical Gotchas)

### ⚠️ Trap 1: Win32 Buffer NUL-Padding
When querying native Windows process paths or module names via Koffi / Win32 FFI (`QueryFullProcessImageNameW`, `GetWindowTextW`), Windows allocates fixed-length native buffers that terminate strings with null bytes (`\0`).
- **The Pitfall**: Native paths may end with trailing `\0` bytes (e.g. `C:\Program Files\Google\Chrome\Application\chrome.exe\0\0`).
- **The Impact**: Node.js `fs.existsSync()` will silently fail or throw, breaking app resurrection ("Jump Here").
- **The Rule**: Always sanitize paths with `.replace(/\0+$/, '').trim()` before checking existence or spawning.

### ⚠️ Trap 2: Modifying `extension-src/` Requires Rebuilding
- **The Pitfall**: Modifying files inside `extension-src/src/` does NOT immediately affect `extension/`.
- **The Impact**: Loading unpacked `extension/` in Chrome or inspecting extension behavior will run outdated bundle code.
- **The Rule**: Always run `npm run build:extension` after changing anything in `extension-src/`.

### ⚠️ Trap 3: Schema Conflation (Do Not Unify Types Arbitrarily)
- `src/` demo fixtures use `RecordingEvent` and `ReplaySnapshot` (an interactive e-commerce demo state).
- `extension-src/` uses `BrowserRecordingEvent` (captures real browser DOM events, CSS selectors, and scroll positions).
- `desktop/` uses `WindowMoment` (captures Win32 window handles, process names, and geometry).
- **The Rule**: Maintain intentional separation. Do not force demo fixture schemas onto the real Chrome extension or desktop capture engines.

### ⚠️ Trap 4: Security & Zero-Trust IPC (Never Trust the Renderer)
- The overlay renderer (`desktop/overlay/`) is sandboxed with `contextIsolation: true`, `nodeIntegration: false`, and a strict CSP (`connect-src 'none'`).
- **The Pitfall**: Blindly trusting the moment object passed over IPC from the renderer to `restoreMoment` or `undo`.
- **The Rule**: The main process **must resolve restore requests from its own internal timeline**. The renderer is only allowed to send a validated moment ID or index.
- **The Rule**: Checkpoint IDs must always be validated against `^[a-zA-Z0-9_-]+$` to prevent directory traversal attacks when saving, deleting, or restoring checkpoints.

### ⚠️ Trap 5: Ghost Shield (Zero-Keylogging & Privacy Invariants)
- **Zero Keylogging**: The project **never** installs global keyboard hooks (`WH_KEYBOARD_LL`). The only synthetic keystroke REWIND ever sends is `Ctrl+Z` to trigger Undo.
- **Strict Privacy Filter**:
  - Windows whose titles mention `incognito`, `private browsing`, `password`, `sign in`, or `1Password`/`Bitwarden` must **never** be recorded.
  - Sensitive input elements (`type="password"`) must have their values strictly masked (`[MASKED]`).
  - High-entropy strings in the clipboard (API keys, private keys, credit cards) must be redacted.

### ⚠️ Trap 6: Atomic 20s WAL File Writes
- `backupEngine.js` performs automatic crash-resilient persistence every 20 seconds.
- **The Pitfall**: Overwriting `.wal` files with direct `fs.writeFileSync(walPath, data)`. If the OS crashes or power drops during write, the WAL file is corrupted.
- **The Rule**: Always write to a `.tmp` file first, then perform an atomic rename (`fs.renameSync`) to the target `.wal` file.

### ⚠️ Trap 7: Linux CI and Mocking Native Win32 APIs
- CI runs on Linux runners (`ubuntu-latest`), but `desktop/win32.js` uses Windows-specific APIs via Koffi.
- **The Rule**: In test suites (`desktop/__tests__/`), native Win32 FFI and Koffi bindings must be mocked cleanly so tests run and pass on Linux without requiring real Win32 DLLs.
- Always run `npm test` to ensure all 17 test suites pass before submitting changes.

### ⚠️ Trap 8: Multi-Project TypeScript Composite References
- The repository has multiple tsconfig files:
  - `tsconfig.json` (Root solution)
  - `tsconfig.app.json` (Web app)
  - `tsconfig.extension.json` (Chrome extension)
  - `tsconfig.node.json` (Vite config scripts)
- **The Rule**: Always use `npx tsc -b` (composite build mode) to typecheck across all project configurations.

---

## 3. Standard Verification Commands

Before finishing any task, run these verification steps:

```bash
# 1. Run all Vitest test suites (17 suites, 78+ tests)
npm test

# 2. Run ESLint (must have 0 errors, 0 warnings)
npm run lint

# 3. Typecheck all projects (app, extension, node)
npx tsc -b

# 4. If modifying extension-src:
npm run build:extension

# 5. If modifying web app:
npm run build
```

---

## 4. Coding Conventions & Style

- **Module Format**: Pure ESM (`"type": "module"` in `package.json`). Use standard `import` / `export`.
- **Formatting**: Preserve existing indentation, semicolons (or omit where omitted), and clean code style.
- **Comments & Docstrings**: Maintain documentation integrity. Never delete docstrings or comments unrelated to your changes.
- **File Links**: When referencing code in docs or chat, use clickable links (`file:///path/to/file#L1-L10`).
