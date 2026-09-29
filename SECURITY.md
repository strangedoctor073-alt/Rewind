# Security policy

## Supported versions

Security fixes are applied to the latest release and the default branch.

## Reporting a vulnerability

Please **do not open a public issue** for a vulnerability. Use GitHub's private reporting instead:
**Security tab → "Report a vulnerability"** on this repository, and include:

- a concise description of the issue;
- reproduction steps or a proof of concept;
- affected files or versions; and
- the potential impact.

We aim to acknowledge a report within seven days and to coordinate a fix before public disclosure when practical.

## Security model

- The desktop overlay runs sandboxed: context isolation on, Node integration off, strict Content-Security-Policy, navigation and pop-ups denied.
- The overlay talks to the main process only through an allow-listed IPC bridge (`desktop/preload.cjs`). The main process never acts on renderer-supplied snapshots; it looks moments up in its own timeline by id.
- Saved state blobs are encrypted with AES-256-GCM using a random per-install key protected by the OS secure store (Electron `safeStorage`, DPAPI on Windows). If the OS store is unavailable a weak fallback key is used and a warning is logged.
- Checkpoint files and `.rewind.backup` exports are plain JSON and may contain window titles and clipboard text. Store and share them accordingly.
- REWIND makes no network requests and sends no telemetry.

## Privacy note

Recordings can contain interaction data. Do not record passwords, payment details, private messages or other sensitive information. The extension masks sensitive form fields, and the desktop app skips password managers and private/incognito windows, but denylists are best-effort.
