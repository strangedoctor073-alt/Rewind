# REWIND

> Record a supported web interaction. Scrub backward through it. Replay any moment. Undo the last one cleanly.

REWIND is a local-first interaction recorder for web experiences you control. Instead of a video, it stores a compact timeline of meaningful events and the state needed to reconstruct each moment — which also means it can undo: pop the last event off the timeline and the UI snaps back to the exact state that was recorded before it, not a best guess.

![License: MIT](https://img.shields.io/badge/license-MIT-d9ff58?style=flat-square)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square)

## Why this is different

Screen recordings show what happened. REWIND lets you move through what happened — and step back out of it.

Use the demo to record an interaction, then drag the timeline backward. The product state changes with the playhead: selected size, typed promo code, bag count, scroll position, and event details all return to the state at that point in time. Hit Undo (or `Ctrl/Cmd+Z`) and the same mechanism runs live: the last action is popped and the surface reverts, because the exact prior state was already captured — no inverse-action guessing required.

This makes REWIND useful for:

- undoing the last few actions in a flow with pixel-exact state restoration, not a generic back button;
- reproducing a UI flow without retelling every click;
- sharing a compact, inspectable bug report;
- reviewing a checkout, onboarding, or product experiment;
- turning a short interaction into a replayable demo.

## Try it locally

```bash
npm install
npm run dev
```

Open the local URL, then:

1. Select **Start recording**.
2. Choose a shoe size, type a promo code, and select **Add to bag**.
3. Select **Stop recording**.
4. Drag the timeline or choose an event card to replay the reconstructed state.
5. Use **Export** to save a portable `.rewind.json` file; use **Import recording** to load one again.

## What works today

- Event capture for clicks, text input, and scroll events within the supported demo surface — scroll position is captured too, not just clicks and typing.
- Timeline scrubbing, play/pause, and 1x/2x/4x replay speed.
- State reconstruction for the demo's selected size, promo code, bag count, and scroll position.
- Event inspector: event type, target, action, recorded size (bytes), and viewport.
- JSON export/import with a versioned recording format.
- Local persistence using IndexedDB — recordings survive a reload, a session list in the sidebar lets you switch between or delete saved recordings, and "Clear local data" wipes everything for a clean-slate test.
- Undo / redo for the current session — pop the last recorded action off the timeline and the demo surface snaps back to the exact reconstructed state (including scroll position) using the event's own stored snapshot, not a guessed inverse. Works live while recording or on any loaded/saved session; branches (new actions after an undo) clear the redo stack.
- Keyboard shortcuts (press `?` in the app to see them): Space to play/pause, arrow keys to step between events, `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` to undo/redo, `R` to record, `E` to export.
- Responsive interface designed for a short, understandable demo.

See [`MANUAL_TESTING.md`](MANUAL_TESTING.md) for the checklist this behavior is verified against.

## Record a real website tab

The web app cannot observe another website by itself. REWIND therefore includes a Chrome/Edge extension that records the tab you explicitly authorize using the browser's temporary `activeTab` permission.

1. Open [`extension/README.md`](extension/README.md) and load the `extension` folder as an unpacked extension.
2. Visit the website you want to record, then choose **Start recording** in the REWIND extension popup.
3. Interact with that same tab and stop the session in the popup.
4. Export the `.rewind.json` file from the popup.
5. In the REWIND dashboard, select **Import recording** to browse its timeline.

The extension records real tab events, but the current dashboard only reconstructs full visual state for the built-in supported demo. Reconstructing arbitrary third-party pages is a separate opt-in adapter/snapshot problem and is not yet shipped.

## What REWIND does *not* claim to do

Browsers intentionally prevent one webpage from freely reading, controlling, or reconstructing every other site. This app therefore records a **supported surface**: the interactive UI embedded in REWIND, or, in a future integration, a page where the recorder has explicit permission.

REWIND is not a covert recorder and is not a magic rewind button for arbitrary websites. A browser extension or page integration will be needed for broader, user-authorized capture.

## Architecture

```text
User interaction
       |
       v
In-page recorder --------> Versioned event log
       |                         |
       v                         v
UI state snapshot <------ Timeline player / scrubber
       |
       v
Rendered replay surface
```

Key modules:

- `src/recorder/inPageRecorder.ts` - browser event capture boundary.
- `src/types/recording.ts` - stable recording and replay contracts.
- `src/storage/recordingStore.ts` - IndexedDB persistence.
- `src/data/demoRecording.ts` - a shareable example recording.
- `src/App.tsx` - the demo surface, timeline, inspector, and import/export wiring.

## Recording format

Recordings are portable JSON documents with a `schemaVersion`. A recording includes timing, semantic event data, and a state snapshot per event. This is deliberately simpler and more inspectable than serializing a whole page.

Never import a recording from an untrusted source if it contains sensitive information. The current demo captures typed values because state replay needs them; production integrations should provide masking rules for passwords, payment fields, and other sensitive inputs.

## Development

```bash
npm run lint
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

## Roadmap

- [ ] Configurable privacy rules and input masking.
- [ ] Generic adapter API for pages that opt in to REWIND state snapshots.
- [ ] Recording library with session names, search, and deletion.
- [ ] Visual state diffing.
- [ ] Browser-extension capture for explicitly permitted pages.
- [ ] Share links that keep the recording private by default.

## Contributing

REWIND is early and intentionally small. Read [CONTRIBUTING.md](CONTRIBUTING.md), review [SECURITY.md](SECURITY.md), and open an issue before large changes so we can keep the core recording format stable.

## License

MIT. See [LICENSE](LICENSE).
