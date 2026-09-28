---
trigger: always_on
---

# Cross-Platform Testing & Process Spawning Invariants

1. **Child Process Mocking in Unit Tests**:
   - In all unit tests (Vitest/Jest), NEVER allow real host binaries (`cmd.exe`, `powershell.exe`, `bash`, `wt.exe`) to be spawned in the background.
   - Always mock `node:child_process.spawn` or use an injectable test hook (`_setSpawnForTesting`) returning a mock child process object with `.unref()` and `.on()` listeners.
   - This ensures tests execute deterministically on Windows, macOS, and Linux (GitHub Actions `ubuntu-latest`) without `ENOENT` crashes.

2. **Defensive Async Process Handling**:
   - Any production code that spawns external processes must attach a defensive `child.on('error', (err) => { ... })` listener to avoid unhandled async exceptions in Node.js event loops.

3. **Interactive Questions (`ask_question`)**:
   - When calling `ask_question`, ensure every question contains an `options` array with at least 2 distinct user-facing choices.
