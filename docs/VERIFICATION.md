# REWIND v6.1 Verification Log

This document tracks verification records and acceptance test (AT) results for each task defined in the REWIND v6.1 implementation brief.

---

## Phase 0 — Truth

### Task T0.1: Documentation & Privacy Truth Audit
- **Status**: PASSED
- **Date**: 2026-10-27
- **Description**: Rewrote `README.md` and `SECURITY.md` to accurately reflect the codebase capabilities, eliminated marketing hyperbole, removed unverified claims (e.g. "sub-millisecond", "pixel-perfect", "Zero Keylogging" badge, "zero-knowledge", "air-gapped"), reinstated "Known Limitations", documented loopback networking disclosure, local screenshot storage, and terminal exclusion.
- **Acceptance Test (AT)**: Review of every sentence in the Privacy & Security Model against the codebase:

| Sentence / Claim in Privacy Section | Codebase Implementation & Verification Reference |
| :--- | :--- |
| **Zero External Network Calls**: No telemetry, no cloud servers, no user accounts. | Audited codebase: zero outbound external HTTP/WebSocket clients. Loopback only. Verified in [daemon/rpc/httpBridge.ts](file:///e:/Git%20hub%20projects/REWIND/daemon/rpc/httpBridge.ts#L36-L55) (binds to `127.0.0.1` only). |
| **Local Loopback Communication**: Restricted to local loopback interfaces (`127.0.0.1:48291` JSON-RPC and `127.0.0.1:48292` HTTP bridge, plus optional local Ollama on `127.0.0.1:11434`). | [daemon/rpc/rpcServer.ts](file:///e:/Git%20hub%20projects/REWIND/daemon/rpc/rpcServer.ts#L61) binds to `127.0.0.1:48291`; [daemon/rpc/httpBridge.ts](file:///e:/Git%20hub%20projects/REWIND/daemon/rpc/httpBridge.ts#L36) binds to `127.0.0.1:48292`. Extension polls this loopback port in [extension/background.js](file:///e:/Git%20hub%20projects/REWIND/extension/background.js#L467). |
| **Overlay CSP blocks all network**: `connect-src 'none'` | [desktop/overlay/index.html](file:///e:/Git%20hub%20projects/REWIND/desktop/overlay/index.html#L7) enforces `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:;">`. |
| **No Global Keylogging**: Desktop application never installs global OS keyboard hooks (`WH_KEYBOARD_LL`). | Audited [desktop/win32.js](file:///e:/Git%20hub%20projects/REWIND/desktop/win32.js) and [daemon/capture/windowCapture.ts](file:///e:/Git%20hub%20projects/REWIND/daemon/capture/windowCapture.ts): only polling APIs (`GetForegroundWindow`, `GetWindowTextW`, `PrintWindow`) are bound; `SetWindowsHookExW` / `WH_KEYBOARD_LL` are absent. |
| **App-Level Undo Synthetic Keystroke**: The only synthetic keystroke REWIND dispatches is `Ctrl+Z` to trigger application-level Undo after focus verification (terminals and shells are excluded). | [desktop/undoEngine.js](file:///e:/Git%20hub%20projects/REWIND/desktop/undoEngine.js#L54-L63) sends `VK_CONTROL` + `0x5A` via `keybd_event` only after verifying window title and process ID, with `TERMINAL_IMAGE_NAMES` check. [daemon/index.ts](file:///e:/Git%20hub%20projects/REWIND/daemon/index.ts#L529-L536) enforces `EXCLUDED_TERMINAL_PROCESSES`. |
| **Extension Input Recording & Masking**: Sensitive form inputs (`type="password"`, `autocomplete` tokens, and field names/labels matching credit cards, passwords, SSNs, CVVs, 2FA/OTP tokens) are masked (`[masked]`) via best-effort heuristic denylists. | [extension/content.js](file:///e:/Git%20hub%20projects/REWIND/extension/content.js#L26-L55) defines `SENSITIVE_FIELD_REGEX` covering passwords, credit cards, CVVs, tokens, secrets, SSNs, OTPs, PINs, bank accounts, and masks with `[masked]`. |
| **Screenshots & Window Framebuffers**: Stored strictly on local machine via Win32 `PrintWindow` for perceptual hashing (dHash) and thumbnail display. Never uploaded. | [daemon/capture/windowCapture.ts](file:///e:/Git%20hub%20projects/REWIND/daemon/capture/windowCapture.ts#L107) and [daemon/capture/phash.ts](file:///e:/Git%20hub%20projects/REWIND/daemon/capture/phash.ts). No upload logic. |
| **Fail-Closed State Encryption**: AES-256-GCM using OS secure store (Electron `safeStorage` / DPAPI). Refuses to store sensitive state if unavailable. | [desktop/stateCapture.js](file:///e:/Git%20hub%20projects/REWIND/desktop/stateCapture.js#L20-L36) throws error instead of weak key fallback. Test in [desktop/__tests__/keyStore.test.ts](file:///e:/Git%20hub%20projects/REWIND/desktop/__tests__/keyStore.test.ts#L48-L62). |
| **Sandboxed Overlay**: Overlay renderer is sandboxed (`contextIsolation: true`, `nodeIntegration: false`) communicating only through allow-listed IPC bridge. | [desktop/main.js](file:///e:/Git%20hub%20projects/REWIND/desktop/main.js#L84-L88) sets `contextIsolation: true`, `nodeIntegration: false`, `preload: path.join(__dirname, 'preload.cjs')`. |

### Task T0.2: Single Version Source & Synchronization
- **Status**: PASSED
- **Date**: 2026-10-27
- **Description**: Unified version declarations across the repository using `package.json` as the single authoritative source (`6.0.0`). Created `scripts/sync-versions.js` to propagate version to `extension/manifest.json`, `launcher/package.json`, and UI displays, and `scripts/check-versions.js` to ensure CI fails if versions diverge. Bound check into `npm test` and CI workflow.
- **Acceptance Test (AT)**:
  1. Ran `check-versions` with intentionally mismatched version (`0.4.0` in manifest.json): check failed with exit code 1 and reported discrepancy.
  2. Ran `npm run sync:versions` followed by `npm run check:versions`: passed with exit code 0 (`✓ All version sources match root package.json: 6.0.0`).
  3. Integrated `check-versions` into `npm test` pipeline so discrepancies break CI build automatically.

### Task T0.3: Quarantine Dead & Unreferenced Code
- **Status**: PASSED
- **Date**: 2026-10-27
- **Description**: Quarantined all modules unreachable from `daemon/main.ts` and `daemon/index.ts` into `/experimental`:
  - `daemon/blobs/` → `experimental/daemon-blobs/`
  - `daemon/ai/{embeddings,hybridSearch,vectorStore}` → `experimental/daemon-ai-search/`
  - `daemon/clipboard/` → `experimental/daemon-clipboard/`
  - `daemon/ocr/boundingBoxStore.ts` → `experimental/daemon-ocr/`
  - `daemon/adapters/pr/` → `experimental/daemon-provenance/`
  - `daemon/db/migrations/002_v3_delta.sql`, `003_v4_cognitive.sql` → `experimental/db-migrations/`
  Excluded `experimental/**` from ESLint, Vitest test suite discovery, and daemon build compiler.
- **Acceptance Test (AT)**:
  1. Verified build output: `npm run build:daemon` compiles `dist-daemon/daemon` containing zero unreferenced modules (`adapters`, `blobs`, `clipboard`, `ocr` completely absent).
  2. Typecheck clean: `npx tsc -b` passed with 0 errors.
  3. Test suite clean: Core test suite (39 suites, 269 tests) runs 100% green without referencing experimental modules.
  4. Documentation clean: README and SECURITY list zero features or claims from `/experimental`.

---

## Phase 1 — Privacy & Safety Blockers

### Task P1.9: Vault Default Passphrase Removal & Minimum Strength Enforcement
- **Status**: PASSED
- **Date**: 2026-10-27
- **Description**: Eliminated the insecure hardcoded default passphrase (`'rewind-default-vault'`) in `bin/rewind.js`. Vault operations now require an explicit passphrase via `--pass`, `REWIND_VAULT_PASS`, or interactive TTY prompt. Added minimum password strength enforcement (at least 12 characters) for vault creation.
- **Acceptance Test (AT)**:
  1. Ran `node bin/rewind.js vault create --out test.vault` without `--pass`: failed closed with error code 1 (`✗ Vault operation aborted: Passphrase is required`).
  2. Ran `node bin/rewind.js vault create --out test.vault --pass "short"`: rejected with error code 1 (`✗ Weak passphrase: Vault creation requires at least 12 characters`).
  3. Tested complete roundtrip encryption and restoration with valid passphrase (`correct-horse-battery-staple-123`): archive created and restored with 100% byte fidelity.

---

## Phase 2 — Core Reliability & Telemetry Truth

### Task F2.6: Stop Lying Telemetry & Schema Phantom Resolution
- **Status**: PASSED
- **Date**: 2026-10-27
- **Description**: 
  1. In `daemon/index.ts` (`provenance.export`), removed the phantom `ocrText` field that attempted to read a non-existent `r.ocr_text` column from the `moments` table.
  2. In `daemon/db/timelineDb.ts` and `daemon/index.ts` (`analytics.telemetryStats`), replaced the hardcoded `walStatus: 'clean'` with real SQLite WAL state computed dynamically via `db.getWalStatus()` using `PRAGMA wal_checkpoint(PASSIVE)` and `PRAGMA journal_mode`.
- **Acceptance Test (AT)**:
  1. Unit test `getWalStatus queries real SQLite WAL pragma` in `daemon/db/__tests__/timelineDb.test.ts` passed.
  2. RPC integration test `analytics.telemetryStats reports computed metrics and real walStatus` in `daemon/__tests__/index.test.ts` passed.
  3. Verified `provenance.export` produces clean schema 1.0.0 output without undefined phantom columns.




