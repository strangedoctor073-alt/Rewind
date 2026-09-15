# Contributing to REWIND

Thanks for considering a contribution.

## Before you start

- Check existing issues and pull requests.
- For substantial changes, open an issue first and describe the problem, proposal, and privacy impact.
- Keep changes focused. A pull request should solve one clear problem.

## Local workflow

```bash
npm install
npm run dev
npm run lint
npx tsc --noEmit -p tsconfig.app.json
```

## Engineering principles

- Do not claim REWIND can record arbitrary websites unless the implementation has explicit, user-authorized access.
- Do not capture sensitive input by default. Any new capture field needs an intentional privacy decision.
- Keep the versioned recording format backward-compatible, or document a migration.
- Prefer semantic interaction events and small state snapshots over opaque page dumps.
- Preserve keyboard access and readable contrast in the interface.

## Pull requests

Explain the user-facing change, list checks you ran, and include a screenshot or short recording for visual changes. Use clear commits; maintainers may squash on merge.

## Code of conduct

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).
