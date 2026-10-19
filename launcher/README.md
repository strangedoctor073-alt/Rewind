# REWIND Launcher

Multi-version distribution manager for REWIND. Install once to discover, download, and switch between GitHub releases.

## How It Works

1. On open, fetches all releases from `strangedoctor073-alt/Rewind` via GitHub API
2. Displays version list with release notes
3. User picks a version → launcher downloads the `.zip` asset from that release
4. Extracts to `%APPDATA%\REWIND Launcher\versions\<tag>\`
5. Launches `REWIND.exe` from that folder

Downloaded versions are cached locally. Switching back to an old version is instant (no re-download).

## Build the Launcher Installer

```bash
# From the repo root:
npm run build:launcher

# Output: dist-launcher/REWIND-Launcher-Setup-1.0.0.exe
```

## Build REWIND with zip target (for launcher to download)

```bash
# Builds NSIS installer + zip + portable:
npm run dist

# Output includes: dist-electron/REWIND-6.0.0-win-x64.zip
# Upload this zip as a GitHub Release asset — launcher will find it automatically
```

## Release Checklist

When releasing a new version:
1. Bump version in `package.json`
2. Run `npm run dist` (produces `REWIND-X.X.X-win-x64.zip` + `REWIND-Setup-X.X.X.exe`)
3. Create a GitHub Release tagged `vX.X.X`
4. Attach **both** files as release assets:
   - `REWIND-X.X.X-win-x64.zip` ← launcher downloads this
   - `REWIND-Setup-X.X.X.exe` ← classic one-click installer (optional)
5. The launcher auto-discovers the new release when users are online — no launcher update needed

## Local Storage

```
%APPDATA%\REWIND Launcher\
├── launcher-config.json     ← last used version
└── versions\
    ├── v6.0.0\
    │   └── REWIND.exe
    └── v6.1.0\
        └── REWIND.exe
```
