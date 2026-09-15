# REWIND Recorder extension

This is the explicit-permission recorder for real browser tabs. It is intentionally kept separate from the Vite web app because a regular webpage cannot observe other websites.

## Load locally in Chrome or Edge

1. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Select this `extension` folder.
5. Open a normal `http` or `https` website.
6. Open the REWIND extension and select **Start recording**.
7. Interact with that tab, then reopen the extension and select **Stop recording**.
8. Select **Export latest recording**. In the REWIND web app, select **Import recording** to inspect the event timeline.

## Privacy

The extension has no broad website host permission. The `activeTab` permission gives temporary access only after you explicitly invoke the extension on the current tab.

It captures click targets, text input, scroll position, page URL, and page title for an active session. Passwords, credit-card fields, and fields whose identifiers suggest secrets are masked. Do not use this pre-release recorder on sensitive applications.

## Current boundary

This extension records real-tab interaction events. The dashboard can inspect and scrub the imported timeline. Full visual reconstruction of an arbitrary third-party page requires an opt-in page adapter or a carefully designed DOM/screenshot snapshot subsystem; it is deliberately not claimed as complete here.
