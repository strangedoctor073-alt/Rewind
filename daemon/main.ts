/**
 * REWIND daemon process entrypoint.
 *
 * `daemon/index.ts` only defines the RewindDaemon class; nothing ever
 * instantiated it outside tests, so `rewind start` spawned a process that did
 * nothing and exited. This file is what actually runs the daemon.
 *
 *   npm run build:daemon && node dist-daemon/daemon/main.js
 */

import { RewindDaemon } from './index.js'

const daemon = new RewindDaemon()

let shuttingDown = false
async function shutdown(code: number): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  try {
    await daemon.stop()
  } finally {
    process.exit(code)
  }
}

process.on('SIGINT', () => void shutdown(0))
process.on('SIGTERM', () => void shutdown(0))
process.on('uncaughtException', (err) => {
  console.error('[REWIND] Uncaught exception:', err)
  void shutdown(1)
})

daemon.start().catch((err: unknown) => {
  const code = (err as NodeJS.ErrnoException | null)?.code
  if (code === 'EADDRINUSE') {
    console.error('[REWIND] A daemon is already running (RPC port in use).')
  } else {
    console.error('[REWIND] Failed to start daemon:', err)
  }
  process.exit(1)
})
