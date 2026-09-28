# Manual testing checklist

REWIND has two things worth testing by hand: the **extension** (the actual
product — record any site, browse history, rewind) and the **demo web app**
(`src/`, a fixture for the timeline/inspector UI patterns). Run through
Part 1 after touching `extension/` or `extension-src/`, and Part 2 after
touching `src/`.

## Part 1 — Extension (the real product)

Build first: `npm run build:extension`, then load `extension/` unpacked
(`chrome://extensions` → Developer mode → Load unpacked).

### Recording on a real site

1. Open any normal `http(s)` website.
2. Open the REWIND popup, select **Start recording**.
3. Click something, type into a text field, scroll the page.
4. Return to the popup — event count and duration should be ticking live.
5. Select **Stop recording**.

Expect: no export/import step required — the recording is already saved
locally in the extension.

### History / Timeline page

1. From the popup, select **Timeline / History**.
2. Expect: the recording from above already appears in the sidebar list,
   with the real page host, event count, and duration — this is a real
   local history, not just "the last recording."
3. Select an event. Expect the inspector to show event type, target
   (selector), page, scroll position, value (or "masked" for sensitive
   fields), and recorded size.
4. Start a second recording on a different site while the Timeline tab is
   still open. Expect the sidebar to pick it up (polls every ~2s) and show a
   live dot while it's active.

### Rewind

1. In the Timeline page, select an event from a recording whose tab is
   **still open** in the browser, then select **Rewind to here**.
2. Expect: that tab is found and focused (not a duplicate new tab), and it
   scrolls to the position recorded at that event.
3. Close that tab, then select **Rewind to here** on the same event again.
4. Expect: REWIND opens a **new** tab at the recorded URL. Scroll position
   is *not* restored this time — that's the documented limitation (see
   `extension/README.md`), not a bug.
5. Select **Replay from here**. Expect it to be visibly disabled — replay on
   real sites isn't implemented yet, and the button should say so rather
   than silently do nothing.

### History management

1. Delete one recording from the sidebar (hover → ×). Expect it disappears
   immediately and isn't restored on reload.
2. Select **Clear all**, confirm the prompt. Expect the whole list empties.
3. Reload the Timeline page (`Cmd/Ctrl+R`). Expect the (now-empty, or
   whatever you left) history persists — it's read from extension storage,
   not page state.

### Privacy

1. Start a recording, then type into a password field on a real login form.
2. Check the event in the inspector. Expect the value to show as "masked",
   never the typed characters.

## Part 2 — Demo web app (`src/`)

Run `npm run dev` and open the local URL. This exercises the timeline/
inspector/undo-redo UI patterns against a bundled fake shopping page — not
a real site.

### A — Recording

1. Open REWIND.
2. Select **Start recording**.
3. Interact with the demo surface: click a size, type a promo code, click **Add to bag**,
   and scroll the product panel (it now scrolls — see the note at the bottom of the
   product details).
4. Select **Stop recording**.

Expect: each interaction appears in the timeline and event list as it happens,
including a `scroll` marker.

### B — Inspect

Select an event in the timeline or event list. The Event Inspector (right panel) should
show:

- **Event type** (`click` / `type` / `scroll`)
- **Target** (what was interacted with)
- **Action** (a human-readable description)
- **Recorded size** (the event's serialized size in bytes)
- **Viewport**

### C — Replay

Select the play button. The demo surface should visibly step through the recorded
clicks, typing, and scroll position in order.

### D — Scrubbing

Drag the timeline or click an earlier/later event marker. The reconstructed state
(selected size, promo code, bag count, and **scroll position**) should jump straight to
what it was at that point — not just interpolate from the current position. This
specifically tests that scroll state, not just form state, is restored.

### E — Persistence

1. Record something (or just let the bundled demo autosave).
2. Reload the page.

Expect: the same recording reappears — REWIND restores the last session from IndexedDB
on load, and the sidebar's "Recordings" list shows what's saved in this browser. Use
**Clear local data** in the sidebar to wipe everything and confirm the app falls back to
an empty state.

### F — Export / import

1. Record something.
2. Select **Export** — a `.rewind.json` file downloads.
3. Select **Clear local data** to simulate a fresh browser (or open a private window).
4. Select **Import recording** and choose the exported file.

Expect: the recording comes back with the same events, timing, and reconstructed state.
Importing a non-REWIND JSON file should fail gracefully with a visible notice rather
than crashing.

### G — Undo / redo

1. Start recording and do a few things: pick a size, type a promo code, add to bag.
2. Select **Undo** (or press `Ctrl/Cmd+Z`) once. Expect: the last action's marker
   disappears from the timeline and the demo surface — bag count, promo code, whichever
   changed — snaps back exactly to what it was before that action, not just visually,
   but as the actual editable state (type in the promo box again and it should behave
   normally).
3. Undo again a couple more times. Expect: it keeps walking back one action at a time,
   and stops being clickable once only the anchor "Recording started" event is left —
   you can't undo past the start of the recording.
4. Select **Redo** (or `Ctrl/Cmd+Shift+Z`). Expect: the most recently undone action
   comes back, in the same order, with the same state.
5. After an undo, do something new (e.g. pick a different size) instead of redoing.
   Expect: Redo becomes unavailable — the old "future" was invalidated by the new
   action, same as undo/redo in a text editor.
6. Stop recording, then try Undo again on the now-stopped session. Expect: it still
   works — undo/redo isn't limited to the moment you're actively recording, it applies
   to whichever session is currently loaded.
