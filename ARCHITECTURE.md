# REWIND Architecture & System Design

This document details the internal architecture, state machine, and communication protocols of **REWIND**.

## System Overview & Subsystem Boundaries

REWIND is structured into five distinct subsystems, each serving a targeted purpose with explicit isolation boundaries:

| Directory | Subsystem | Runtime & Purpose | Primary Storage & Protocols |
| :--- | :--- | :--- | :--- |
| `daemon/` | **Headless Background Daemon** | Node.js + TypeScript service capturing window switches, workspace state, and git branch context. Provides JSON-RPC and HTTP bridge. | SQLite in WAL mode (`%LOCALAPPDATA%\Rewind\timeline.db`), FTS5 index, TCP `48291`, Named Pipe `\\.\pipe\rewind-daemon-rpc`, HTTP `48292`. |
| `desktop/` | **Desktop Time Machine** | Electron + Win32 FFI (Koffi) running a floating HUD pill and sandboxed overlay window. | 20s atomic WAL file (`rewind_session.wal`), AES-256-GCM encrypted state blobs via OS `safeStorage` (DPAPI), encrypted checkpoints. |
| `extension/` & `extension-src/` | **Chrome MV3 Browser Recorder** | Hand-written background service worker and content script with React 19 timeline dashboard (`extension-src/`). | `chrome.storage.local`, typed runtime messaging, and storage-change notifications. |
| `bin/` | **Command Line Interface (`rewind`)** | Executable CLI communicating with the daemon over named pipe or TCP JSON-RPC. | Newline-delimited JSON-RPC, 256-bit bearer token auth. |
| `src/` | **REWIND Studio and development fixture** | Vite + React Studio backed by the local daemon; its searchable timeline is the default, with Graph, Filmstrip, Compare, and Insights views. A separate sample-recording fixture is available only in development mode. | Authenticated local HTTP bridge for Studio data; fixture mode uses local mock state (`RecordingEvent`, `ReplaySnapshot`). |

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                     REWIND Core Architecture                           │
│                                                                                        │
│  ┌───────────────────────┐          JSON-RPC (Named Pipe / TCP 48291)                 │
│  │    CLI (`bin/rewind`) │ ──────────────────────────────────────┐                     │
│  └───────────────────────┘                                       │                     │
│                                                                  ▼                     │
│  ┌───────────────────────┐   HTTP Bridge (127.0.0.1:48292)   ┌──────────────────────┐  │
│  │   Dashboard / Web UI  │ ─────────────────────────────────►│   Headless Daemon    │  │
│  │   (`src/` & Studio)   │     (Bearer token authenticated)  │   (`daemon/`)        │  │
│  └───────────────────────┘                                   │                      │  │
│                                                              │  - SQLite + FTS5     │  │
│  ┌───────────────────────┐   CORS Preflight (Pinned ID)      │  - Workspace Resurrect│ │
│  │  Chrome MV3 Extension │ ─────────────────────────────────►│  - Focus Analytics   │  │
│  │  (`extension/`)       │                                   │  - Encrypted Vault   │  │
│  └───────────────────────┘                                   └──────────────────────┘  │
│                                                                                        │
│  ┌──────────────────────────────────────────────────────────────────────────────────┐  │
│  │                      Electron Desktop Time Machine (`desktop/`)                   │  │
│  │  ┌─────────────────────────┐          IPC Bridge          ┌───────────────────┐  │  │
│  │  │  Sandboxed HUD Overlay  │ ◄──────────────────────────► │    Main Process   │  │  │
│  │  │  (CSP: connect-src none)│    (Allow-listed methods)    │    (Win32 FFI)    │  │  │
│  │  └─────────────────────────┘                              └─────────┬─────────┘  │  │
│  │                                                                     │            │  │
│  │                                                                     ▼            │  │
│  │                                                          [Atomic 20s WAL / DPAPI]│  │
│  └──────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Browser Extension Subsystem (`extension/` & `extension-src/`)

## Storage Architecture

REWIND stores session data exclusively in `chrome.storage.local`. The storage layout uses namespaced keys:

| Key Pattern | Type | Purpose |
| :--- | :--- | :--- |
| `rewind:index` | `RecordingSummary[]` | Lightweight session index containing titles, hosts, timestamps, event counts, and active flags. Used to render the history sidebar without deserializing heavy event payloads. |
| `rewind:recording:<uuid>` | `BrowserRecording` | Full recording document containing all interaction events (`BrowserRecordingEvent[]`), metadata, and source URL. |
| `rewind:session:<tabId>` | `string` (`uuid`) | Active recording pointer mapping an open Chrome tab ID to its currently active recording session. |

### Recording Schema (`v1`)

```typescript
interface BrowserRecording {
  schemaVersion: 1
  id: string
  title: string
  duration: number
  createdAt: string
  source?: {
    url: string
    title: string
    mode: 'extension'
  }
  events: BrowserRecordingEvent[]
  active?: boolean
}

interface BrowserRecordingEvent {
  id: string
  timestamp: number
  kind: 'click' | 'type' | 'scroll'
  icon: string
  label: string
  description: string
  category: string
  target: string
  url?: string
  title?: string
  scrollX?: number
  scrollY?: number
  value?: string
  masked?: boolean
}
```

---

## Message Passing Protocols

The extension utilizes typed Chrome messaging (`chrome.runtime.sendMessage` and `chrome.tabs.sendMessage`):

### Content Script $\rightarrow$ Background

- `REWIND_EVENT`: Dispatched whenever a pointer click, text input, or scroll event occurs on an active tab.
  - The background service appends the event to the active tab's session and updates `duration`.

### Background $\rightarrow$ Content Script

- `REWIND_START`: Signals `content.js` to begin capturing user interactions and reset relative timestamp offset (`performance.now()`).
- `REWIND_STOP`: Instructs `content.js` to detach active event listeners.
- `REWIND_SCROLL_TO`: Commands `content.js` to execute `window.scrollTo({ top: scrollY, behavior: 'smooth' })`.

### Popup & Timeline Dashboard $\rightarrow$ Background

- `POPUP_STATUS`: Queries active recording state and metadata for the current tab.
- `POPUP_START` / `POPUP_STOP`: Starts or stops recording on the active tab.
- `POPUP_EXPORT`: Retrieves the current or most recent recording as JSON.
- `HISTORY_LIST`: Fetches `rewind:index`.
- `HISTORY_GET`: Fetches `rewind:recording:<id>`.
- `HISTORY_DELETE`: Removes recording blob and cleans up `rewind:index`.
- `HISTORY_CLEAR`: Purges all recordings and resets `rewind:index` to `[]`.
- `REWIND_TO`: Executes tab resolution and scroll restoration for a selected event.

---

## Tab Resolution & Scroll Restoration Strategy

When a user triggers **Rewind to this moment**:
1. REWIND extracts the `targetUrl` and `scrollY` from the chosen `BrowserRecordingEvent`.
2. `background.js` queries all open tabs (`chrome.tabs.query({})`) and compares URLs using path-normalized origin matching (`sameLocation(a, b)`):
   ```javascript
   function sameLocation(a, b) {
     const left = new URL(a)
     const right = new URL(b)
     return left.origin === right.origin && left.pathname === right.pathname
   }
   ```
3. If an open tab matches:
   - Focuses the tab and bringing its window to the foreground (`chrome.windows.update`).
   - Dispatches `REWIND_SCROLL_TO` to the resident `content.js` script to smoothly restore the vertical scroll position.
4. If no open tab matches:
   - Opens the URL in a new tab (`chrome.tabs.create`).

---

## DOM Target Selector Generator

To ensure recorded events are debuggable and replay-stable:
1. Checks for explicit IDs, ignoring auto-generated framework IDs (e.g. React `:r1:`, styled-components hashes, long numerical IDs).
2. Checks for test/automation attributes (`data-rewind-target`, `data-testid`, `data-test`).
3. Checks for `name` attribute on input elements (`input[name="email"]`).
4. Traverses up to 4 parent elements to generate a deterministic `:nth-of-type` selector tree.

---

## Sensitive Input Masking Guardrails

To mitigate credential leakage:
- Elements with `type="password"` are masked.
- Elements with `autocomplete` containing `cc-*`, `one-time-code`, `current-password`, or `new-password` are masked.
- Elements whose `name`, `id`, `autocomplete`, or placeholder contains word-boundary tokens like `password`, `card`, `cvv`, `secret`, `token`, `otp`, `2fa`, `ssn`, `bank`, or `pin` are masked.
- Contenteditable elements with matching sensitive role/aria attributes are screened.
- Masked values are replaced with `"[masked]"` before serialization.
- *Note*: Masking operates via heuristic denylists. Users must exercise caution and avoid typing sensitive personal credentials into custom, untagged form inputs during recorded sessions.
