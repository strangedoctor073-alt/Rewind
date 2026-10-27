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

- **Sandboxed Overlay**: The desktop overlay runs sandboxed (`contextIsolation: true`, `nodeIntegration: false`, strict Content-Security-Policy `connect-src 'none'`, navigation and pop-ups denied).
- **Zero-Trust IPC**: The overlay talks to the main process only through an allow-listed IPC bridge (`desktop/preload.cjs`). The main process never acts on renderer-supplied snapshots; it resolves moments from its own timeline by ID.
- **Fail-Closed Encryption**: Saved application state blobs are encrypted with AES-256-GCM using a random per-install key protected by the OS secure store (Electron `safeStorage`, DPAPI on Windows). If OS secure storage is unavailable, REWIND fails closed and refuses to store sensitive state rather than degrading to weak obfuscation.
- **Encrypted Checkpoints & Vaults**: Checkpoints support AES-256-GCM encryption at rest. Standalone timeline vaults (`rewind vault`) utilize AES-256-GCM with PBKDF2-HMAC-SHA256 key derivation at 600,000 iterations (conforming to OWASP guidelines).
- **Local Loopback Network Isolation**: REWIND makes zero external network requests and transmits no telemetry. Internal inter-process communication is bound exclusively to local loopback (`127.0.0.1:48291` JSON-RPC and `127.0.0.1:48292` HTTP bridge). The HTTP bridge validates Origin headers and supports pinning authorized extension IDs.
- **Token Protection & Access Control**: Daemon communication requires a 256-bit authentication token (`auth.token`). On Windows, NTFS ACLs are applied via `icacls` to restrict read/write access to the current Windows user. Note that any process running with the same user privileges can access local user profile files.

## Privacy note & Heuristic Masking

Recordings can contain interaction data. Do not record passwords, payment details, private messages or other sensitive information.
- The browser extension masks sensitive input fields (`type="password"`, `autocomplete` tokens, and field names/labels matching credit cards, passwords, SSNs, CVVs, 2FA/OTP tokens).
- The desktop app detects and pauses capture on known password manager titles/processes and private/incognito windows.
- **Screenshots & Window Previews**: When capture is enabled, local window framebuffers are captured via Win32 `PrintWindow` for thumbnail display and perceptual difference hashing. All images are stored strictly on the local machine and are never transmitted externally.
- **Terminal & Shell Boundary**: Terminal scrollback buffers and interactive shell command outputs are not recorded. Automated application-level undo (`Ctrl+Z`) explicitly excludes terminal/shell processes to avoid sending ASCII `0x1A` control characters.
- **Important**: Denylists and keyword heuristics are best-effort protections. They cannot guarantee that unconventional form fields, custom canvas components, or untagged inputs are fully masked. Users should avoid interacting with sensitive credentials during active recording sessions.
