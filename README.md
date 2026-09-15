# REWIND

> Record a supported web interaction. Scrub backward through it. Replay any moment.

REWIND is a local-first interaction recorder for web experiences you control. Instead of a video, it stores a compact timeline of meaningful events and the state needed to reconstruct each moment.

![License: MIT](https://img.shields.io/badge/license-MIT-d9ff58?style=flat-square)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=flat-square)

## Why this is different

Screen recordings show what happened. REWIND lets you move through what happened.

Use the demo to record an interaction, then drag the timeline backward. The product state changes with the playhead: selected size, typed promo code, bag count, and event details all return to the state at that point in time.

This makes REWIND useful for:

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

- Event capture for clicks, text input, and scroll events within the supported demo surface.
- Timeline scrubbing and play/pause.
- State reconstruction for the demo's selected size, promo code, and bag count.
- Event inspector and previous-state comparison.
- JSON export/import with a versioned recording format.
- Local persistence using IndexedDB.
- Responsive interface designed for a short, understandable demo.

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
