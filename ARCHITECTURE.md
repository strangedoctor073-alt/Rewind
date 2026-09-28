# REWIND Architecture & System Design

This document details the internal architecture, state machine, and communication protocols of **REWIND**.

## System Overview

REWIND is divided into two primary subsystems:
1. **The Chrome Extension (`extension/` & `extension-src/`)**: The core product for recording real websites, managing sessions in `chrome.storage.local`, and rewinding tab state.
2. **The Web Development Fixture (`src/`)**: A sandbox for testing timeline scrubbing, undo/redo mechanics, and UI component patterns.

```
┌────────────────────────────────────────────────────────┐
│                      Chrome Browser                    │
│                                                        │
│  ┌────────────────────┐       ┌─────────────────────┐  │
│  │ Target Website Tab │       │ Timeline Window Tab │  │
│  │                    │       │ (React 19 Dashboard)│  │
│  │   [content.js]     │       │ [extension-src/]    │  │
│  └─────────▲──────────┘       └──────────▲──────────┘  │
│            │                             │             │
│            │   chrome.tabs.sendMessage   │             │
│            │   chrome.runtime.sendMessage│             │
│            │                             │             │
│  ┌─────────▼─────────────────────────────▼──────────┐  │
│  │          Background Service Worker               │  │
│  │               (background.js)                    │  │
│  │                                                  │  │
│  │   - Session Manager (per-tab session pointers)   │  │
│  │   - Storage Engine (rewind:index, recordings)    │  │
│  │   - Tab Resolver & Scroll Restorer               │  │
│  └───────────────────────┬──────────────────────────┘  │
│                          │                             │
│                          ▼                             │
│              [chrome.storage.local]                    │
│                                                        │
└────────────────────────────────────────────────────────┘
```

---

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

To ensure recorded events are debuggable, `content.js` calculates a minimal CSS selector path:
1. Checks for explicit ID (`#elementId`).
2. Checks for `data-rewind-target` attribute.
3. Checks for `name` attribute on input elements (`input[name="email"]`).
4. Traverses up to 4 parent elements to generate a deterministic `:nth-of-type` selector tree.

---

## Sensitive Input Masking Guardrails

To prevent credential leakage:
- Elements with `type="password"` are strictly masked.
- Elements with `autocomplete` containing `cc-*`, `current-password`, or `new-password` are masked.
- Elements whose `name`, `id`, `autocomplete`, or `aria-label` contains tokens like `password`, `card`, `cvv`, `secret`, or `token` are masked.
- Masked values are replaced with `"[masked]"` before serialization, ensuring plaintext credentials never enter `chrome.storage` or export files.
