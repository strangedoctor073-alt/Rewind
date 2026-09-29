# Changelog

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
