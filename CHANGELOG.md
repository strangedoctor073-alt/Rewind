# Changelog

## 5.0.0 - Deep Resurrection

### Added
- **Workspace resurrection** (`timeline.resurrectWorkspace`, `rewind resurrect <momentId> [--dry-run]`, dashboard **⚡ Resurrect Workspace** / **Preview**): reopens VS Code / Insiders / Cursor files, Windows Terminal directories and browser tabs recorded around a moment, then restores window placement. `daemon/resurrect/`.
- Zero-trust by construction: only a moment id is accepted; everything launched is derived from the daemon's own database; commands are argv arrays from a two-entry allow-list (`rundll32.exe`, `wt.exe`); URLs/paths are validated; Ghost Shield applies on the way out too.
- **Dashboard HTTP bridge** (`daemon/rpc/httpBridge.ts`, port 48292): loopback only, bearer token, Host + Origin checks, JSON content type, 64 KB cap. `rewind token` prints the pairing token.
- `daemon/main.ts` entrypoint, `npm run build:daemon`, `npm run daemon`.
- Extension: `REWIND_RESTORE_TABS` handler; first test suite for the extension.
- Retention: moments older than `retentionDays` (default 30) and their screenshots are purged hourly; the WAL is actually checkpointed on its timer.

### Fixed (found in the v5.0 audit)
- **`rewind start` never started anything.** It spawned `node --import tsx daemon/index.ts`; `tsx` was not a dependency and `index.ts` only exported a class. Now spawns the compiled `dist-daemon/daemon/main.js` and verifies it answers.
- **Dashboard could never connect to the daemon** (HTTP `fetch` against a raw-TCP JSON-RPC port).
- **Windows capture silently never worked**: `require('koffi')` in an ES module threw and was swallowed. Replaced the placeholder drivers (which fabricated a window handle and grey pixels on non-Windows) with a real fail-closed GDI driver; captured moments now record the real window title, process and bounds instead of the literal "ActiveWindow".
- **Ghost Shield was absent from the daemon capture path.** Password managers / incognito windows are now vetoed before any pixels are read (`daemon/privacy.ts`, parity-tested against `desktop/security.js`).
- RPC server: `stop()` hung forever while any client was connected (so the database was never closed after `rewind stop`); a port clash crashed the process; handlers' `{code,message}` errors were reported as "Internal error"; a 10 s timer leaked on every error; pipelined requests could be answered out of order; no limit on failed auth attempts or on silent unauthenticated connections.
- Daemon start: the auth token was overwritten *before* the port was bound, so a second daemon locked clients out of the first; a failed start leaked the DB handle. `daemon.status` reported at most 50 moments; `daemon.pause` accepted NaN/negative minutes and a stale timer could un-pause a later pause early; capture ticks could overlap.
- `auth.token` is now written with mode 0600.
- Database: moment + FTS insert is one transaction; `limit`/`offset` are clamped.
- Desktop: after a timed privacy pause expired the **clipboard engine stayed paused forever**; windows merely containing "Rewind" in their title (e.g. an editor on this project) were never recorded; unvalidated renderer input could throw inside the main process (`copy-to-clipboard`, pause minutes, checkpoint label); a second instance could run alongside the first.
- Extension: events were lost to read-modify-write races, failed saves, and service-worker eviction; recordings could grow past the storage quota; starting twice or closing a tab left recordings "active" forever; `<textarea>` fields were never masked; textarea/select labels leaked their contents; unescaped values in generated selectors; "Extension context invalidated" errors.
- CLI: `autostart enable` wrote a broken registry value (unquoted `/d` argument, cwd-relative path); `rewind pause abc` sent NaN. The CLI no longer runs when imported.
- Tooling: `daemon/` was not covered by any tsconfig (two real type errors hid there) and `desktop/`, `bin/`, `extension/` JavaScript was never linted (9 findings). Both now covered; CI also builds the daemon.

### Known limitations
- Win32 capture and geometry drivers (`windowCapture.ts`, `win32Driver.ts`) have not been run on real Windows hardware.
- The daemon cannot push tab sets to the extension (no bridge); see ROADMAP Phase 5.3.
- Terminal resurrection restores shell + directory only; no scrollback or git branch.
- Dashboard telemetry panel still shows demo statistics; `/api/clipboard`, `/api/ocr`, `/api/ai` endpoints it references do not exist on the daemon.
- `timeline.undo` and `provenance.export` RPC methods remain placeholders.

### Verification
`tsc -b`, `eslint .`, `npm run build:daemon` clean. New and existing tests that do not rely on `vi.mock` were executed with a stand-in runner in a Linux sandbox; the mocked suites (`daemon/__tests__/index.test.ts`, `rpcServer.test.ts`, `windowCapture.test.ts`, ...) and the Electron/Koffi suites need a real `npm test` on your machine.

## 1.0.0

First public release.

### Included
- Desktop Time Machine for Windows (Electron): window timeline, clipboard history, verified-focus Undo, checkpoints, 20 s auto-backup, activity stats, window privacy filter.
- Chrome MV3 extension: record, browse and rewind web sessions.
- React dev fixture for the timeline UI.

### Security hardening (pre-release audit)
- Overlay renderer sandboxed with context isolation, allow-listed IPC and a strict CSP.
- Restore requests are resolved from the main process timeline; renderer payloads are no longer trusted.
- Checkpoint ids are validated, closing a path-traversal hole in restore, delete and bundle import.
- State encryption now uses a random per-install key wrapped by the OS secure store instead of a username-derived key.

### Fixed
- Overlay header: search bar was crushed to a few pixels and its shortcut hint overlapped the tabs. Header now lays out correctly at every width; expanded window widened to 1100 px.
- Windows that merely lost focus were recorded as "closed". A window is now recorded as closed only when it no longer exists.
- Removed fabricated terminal history and scrollback that were being stored for terminals.
- "Jump Here" could fail with "Could not restore window geometry" for a real, already-installed app (seen with Chrome). The captured executable path could end up padded with trailing NUL characters from the native buffer, which silently broke the on-disk existence check. The path is now sanitized, and if it still can't be found, relaunch falls back to the same executable-name lookup Windows' own Start > Run uses.

### Known limitations
See the README section "Known limitations". Notably: no screen capture, game/battery guard not wired to live signals, no real OCR, shallow terminal resurrection, unencrypted backup exports, Tauri scaffold is experimental.
