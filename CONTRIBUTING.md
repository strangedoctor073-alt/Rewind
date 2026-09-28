# Contributing to REWIND

Thanks for considering a contribution.

## Before you start

- Check existing issues and pull requests.
- For substantial changes, open an issue first and describe the problem, proposal, and privacy impact.
- Keep changes focused. A pull request should solve one clear problem.

## Local workflow

```bash
npm install
npm run dev                 # demo web app (src/) — dev fixture, not the product
npm run build:extension     # builds extension/timeline.html from extension-src/
npm run lint
npx tsc -b                  # typechecks demo app, extension Timeline page, and vite configs
```

The extension itself (`extension/`) is loaded unpacked — see
[`extension/README.md`](extension/README.md). Re-run `npm run build:extension`
after any change under `extension-src/`, then reload the extension in
`chrome://extensions`.

## Engineering principles

- Do not claim REWIND can record arbitrary websites unless the implementation has explicit, user-authorized access.
- Do not capture sensitive input by default. Any new capture field needs an intentional privacy decision.
- Don't expand what the `tabs` permission is used for beyond "read open tabs' URL/title to match a recorded page" without flagging it — it does not grant script injection, and this project deliberately hasn't requested a broad host permission (`<all_urls>`) to add that. If a change needs one, call it out explicitly in the PR description rather than adding it quietly.
- Keep the versioned recording format backward-compatible, or document a migration. The demo app's `RecordingEvent`/`ReplaySnapshot` (shopping-page state) and the extension's `BrowserRecordingEvent` (real-tab event) are intentionally different shapes — don't force one into the other's format.
- Prefer semantic interaction events and small state snapshots over opaque page dumps.
- Preserve keyboard access and readable contrast in the interface.
- Don't claim "Replay" or full state reconstruction works on real sites until it actually does — the UI should show a feature as unavailable rather than silently do less than it implies.

## Pull requests

Explain the user-facing change, list checks you ran, and include a screenshot or short recording for visual changes. Use clear commits; maintainers may squash on merge.

## Code of conduct

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
