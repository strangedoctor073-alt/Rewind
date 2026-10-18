#!/usr/bin/env node

/**
 * REWIND CLI Control Suite
 * Subcommands: start | stop | status | token | search | resurrect | undo | pause | export | help
 *
 * Communicates with the daemon via Named Pipe using NDJSON JSON-RPC 2.0.
 */

import { createConnection } from 'node:net'
import { spawn, execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/* ── ANSI Colors ────────────────────────────────────────────────── */

const GREEN  = '\x1b[32m'
const RED    = '\x1b[31m'
const CYAN   = '\x1b[36m'
const YELLOW = '\x1b[33m'
const DIM    = '\x1b[2m'
const BOLD   = '\x1b[1m'
const RESET  = '\x1b[0m'

/* ── Config ─────────────────────────────────────────────────────── */

const PIPE_NAME = '\\\\.\\pipe\\rewind-daemon-rpc'
const TIMEOUT_MS = 5000

/* ── Auth ───────────────────────────────────────────────────────── */

function readAuthToken() {
  const base = process.env.LOCALAPPDATA || join(process.env.HOME || process.env.USERPROFILE || '.', 'AppData', 'Local')
  const tokenPath = join(base, 'Rewind', 'auth.token')
  try {
    return readFileSync(tokenPath, 'utf-8').trim()
  } catch {
    return null
  }
}

/* ── RPC Client ─────────────────────────────────────────────────── */

let rpcIdCounter = 1

function sendRpcCommand(method, params = {}) {
  return new Promise((resolve, reject) => {
    const token = readAuthToken()
    if (!token && method !== 'auth') {
      reject(new Error('No auth token found. Is the daemon running?'))
      return
    }

    const socket = createConnection(PIPE_NAME)
    let buffer = ''
    let authenticated = false
    const requestId = rpcIdCounter++

    const timeout = setTimeout(() => {
      socket.destroy()
      reject(new Error('Timed out waiting for daemon response'))
    }, TIMEOUT_MS)

    socket.setEncoding('utf-8')

    socket.on('connect', () => {
      // Authenticate first
      const authMsg = JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'auth', params: { token } })
      socket.write(authMsg + '\n')
    })

    socket.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed) continue

        try {
          const response = JSON.parse(trimmed)

          if (!authenticated) {
            if (response.error) {
              clearTimeout(timeout)
              socket.destroy()
              reject(new Error(`Authentication failed: ${response.error.message}`))
              return
            }
            authenticated = true
            // Now send the actual command
            const msg = JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params })
            socket.write(msg + '\n')
            continue
          }

          // This is the actual response
          clearTimeout(timeout)
          socket.destroy()
          if (response.error) {
            reject(new Error(response.error.message))
          } else {
            resolve(response.result)
          }
        } catch {
          // ignore parse errors on partial data
        }
      }
    })

    socket.on('error', (err) => {
      clearTimeout(timeout)
      if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
        reject(new Error('REWIND Daemon is not running. Start it with: rewind start'))
      } else {
        reject(err)
      }
    })
  })
}

/* ── Subcommands ────────────────────────────────────────────────── */

/** Compiled daemon entrypoint produced by `npm run build:daemon`. */
function daemonEntryPath() {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'dist-daemon', 'daemon', 'main.js')
}

async function cmdStart() {
  console.log(`${CYAN}↶ REWIND Daemon starting...${RESET}`)
  const entry = daemonEntryPath()
  // The old code spawned `node --import tsx daemon/index.ts`: tsx was never a
  // dependency, and index.ts only exports a class, so nothing ever ran.
  if (!existsSync(entry)) {
    console.error(`${RED}✗ Daemon is not built. Run: npm run build:daemon${RESET}`)
    process.exit(1)
  }
  try {
    const child = spawn(process.execPath, [entry], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    })
    child.unref()
    console.log(`${DIM}  Spawned PID ${child.pid}; waiting for it to answer...${RESET}`)
  } catch (err) {
    console.error(`${RED}✗ Failed to start daemon: ${err.message}${RESET}`)
    process.exit(1)
  }

  // Detached + stdio ignored means a crash is invisible, so confirm it came up.
  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    try {
      await sendRpcCommand('daemon.status')
      console.log(`${GREEN}✓ Daemon is running.${RESET} ${DIM}Use 'rewind status' for details.${RESET}`)
      return
    } catch {
      // not up yet
    }
  }
  console.error(`${RED}✗ The daemon did not respond. Run it in the foreground to see the error:${RESET}\n  node "${entry}"`)
  process.exit(1)
}

async function cmdStop() {
  try {
    await sendRpcCommand('daemon.stop')
    console.log(`${GREEN}✓ REWIND Daemon stopped.${RESET}`)
  } catch (err) {
    console.error(`${RED}✗ ${err.message}${RESET}`)
    process.exit(1)
  }
}

async function cmdStatus() {
  try {
    const status = await sendRpcCommand('daemon.status')
    const uptimeMin = Math.round((status.uptime || 0) / 60)
    console.log(`${BOLD}↶ REWIND Daemon Status${RESET}`)
    console.log(`  ${CYAN}Running:${RESET}  ${status.running ? GREEN + '●' : RED + '○'}${RESET} ${status.running ? 'Active' : 'Inactive'}`)
    console.log(`  ${CYAN}Paused:${RESET}   ${status.paused ? YELLOW + '⏸ Yes' : GREEN + '▶ No'}${RESET}`)
    console.log(`  ${CYAN}Uptime:${RESET}   ${uptimeMin} min (${status.uptime}s)`)
    console.log(`  ${CYAN}Moments:${RESET}  ${status.momentCount}`)
    console.log(`  ${CYAN}Database:${RESET} ${DIM}${status.dbPath}${RESET}`)
  } catch (err) {
    console.error(`${RED}✗ ${err.message}${RESET}`)
    process.exit(1)
  }
}

async function cmdToken() {
  const token = readAuthToken()
  if (!token) {
    console.error(`${RED}✗ No auth token found. Is the daemon running?${RESET}`)
    process.exit(1)
  }
  console.error(`${YELLOW}This token grants full control of the daemon. Paste it only into the REWIND dashboard.${RESET}`)
  console.log(token)
}

/** Parse `rewind resurrect <momentId> [--dry-run]` arguments. */
function parseResurrectArgs(args) {
  const dryRun = args.includes('--dry-run')
  const momentId = args.find((a) => !a.startsWith('--'))
  return { momentId, dryRun }
}

async function cmdResurrect(args) {
  const { momentId, dryRun } = parseResurrectArgs(args)
  if (!momentId) {
    console.error(`${RED}✗ Usage: rewind resurrect <momentId> [--dry-run]${RESET}`)
    process.exit(1)
  }
  try {
    const report = await sendRpcCommand('timeline.resurrectWorkspace', { momentId, dryRun })
    console.log(`${BOLD}↶ Workspace ${dryRun ? 'plan' : 'resurrection'} for moment ${report.momentId}${RESET}`)
    console.log(`${DIM}${'─'.repeat(60)}${RESET}`)
    const icon = { launched: `${GREEN}✓`, planned: `${CYAN}•`, skipped: `${YELLOW}–`, failed: `${RED}✗` }
    for (const r of report.results) {
      console.log(`  ${icon[r.status] ?? '?'}${RESET} ${r.label}`)
      console.log(`    ${DIM}${r.detail}${RESET}`)
    }
    if (report.results.length === 0) console.log(`  ${YELLOW}Nothing resurrectable was found around that moment.${RESET}`)
    const sum = report.summary
    console.log(`${DIM}launched ${sum.launched} · planned ${sum.planned} · skipped ${sum.skipped} · failed ${sum.failed}${RESET}`)
  } catch (err) {
    console.error(`${RED}✗ ${err.message}${RESET}`)
    process.exit(1)
  }
}

async function cmdSearch(query) {
  if (!query) {
    console.error(`${RED}✗ Usage: rewind search <query>${RESET}`)
    process.exit(1)
  }

  try {
    const results = await sendRpcCommand('timeline.search', { query, limit: 20 })
    if (!results || results.length === 0) {
      console.log(`${YELLOW}No results found for "${query}".${RESET}`)
      return
    }

    console.log(`${BOLD}↶ Search Results for "${query}"${RESET}`)
    console.log(`${DIM}${'─'.repeat(60)}${RESET}`)
    for (const r of results) {
      console.log(`  ${CYAN}[${r.moment_id}]${RESET} ${r.snippet || '(no snippet)'}`)
    }
    console.log(`${DIM}${results.length} result(s) found.${RESET}`)
  } catch (err) {
    console.error(`${RED}✗ ${err.message}${RESET}`)
    process.exit(1)
  }
}

async function cmdUndo() {
  try {
    const result = await sendRpcCommand('timeline.undo')
    if (result.undone) {
      console.log(`${GREEN}✓ Undo performed.${RESET}`)
    } else {
      console.log(`${YELLOW}⚠ ${result.reason || 'Nothing to undo.'}${RESET}`)
    }
  } catch (err) {
    console.error(`${RED}✗ ${err.message}${RESET}`)
    process.exit(1)
  }
}

async function cmdPause(minutes) {
  try {
    const parsed = minutes ? parseInt(minutes, 10) : undefined
    if (minutes && !Number.isFinite(parsed)) {
      console.error(`${RED}✗ Usage: rewind pause [minutes]${RESET}`)
      process.exit(1)
    }
    const params = parsed ? { minutes: parsed } : {}
    const result = await sendRpcCommand('daemon.pause', params)
    if (result.paused) {
      const msg = result.resumesIn ? ` Resumes in ${result.resumesIn}.` : ''
      console.log(`${YELLOW}⏸ Recording paused.${msg}${RESET}`)
    } else {
      console.log(`${GREEN}▶ Recording resumed.${RESET}`)
    }
  } catch (err) {
    console.error(`${RED}✗ ${err.message}${RESET}`)
    process.exit(1)
  }
}

async function cmdExport(branch) {
  try {
    const params = branch ? { branch } : {}
    const result = await sendRpcCommand('provenance.export', params)
    console.log(JSON.stringify(result, null, 2))
  } catch (err) {
    console.error(`${RED}✗ ${err.message}${RESET}`)
    process.exit(1)
  }
}

async function cmdMacro(args) {
  const action = args[0]?.toLowerCase()
  if (action !== 'export') {
    console.error(`${RED}Usage: rewind macro export [--format playwright] [--output <file>] [--name <testName>]${RESET}`)
    process.exit(1)
  }

  const formatIdx = args.indexOf('--format')
  const format = formatIdx >= 0 ? args[formatIdx + 1] : 'playwright'

  const outputIdx = args.indexOf('--output')
  const outputPath = outputIdx >= 0 ? args[outputIdx + 1] : null

  const nameIdx = args.indexOf('--name')
  const testName = nameIdx >= 0 ? args[nameIdx + 1] : undefined

  try {
    const result = await sendRpcCommand('macro.export', {
      format,
      testName,
    })

    if (outputPath) {
      const { writeFileSync } = await import('node:fs')
      writeFileSync(outputPath, result.code, 'utf-8')
      console.log(`${GREEN}✓ Exported ${result.format} macro (${result.stepsCount} steps) to ${outputPath}${RESET}`)
      if (result.secretsUsed?.length) {
        console.log(`  ${YELLOW}Secrets parameterized:${RESET} ${result.secretsUsed.join(', ')}`)
      }
    } else {
      console.log(result.code)
    }
  } catch (err) {
    console.error(`${RED}✗ Macro export failed: ${err.message}${RESET}`)
    process.exit(1)
  }
}


async function cmdCapture() {
  try {
    const result = await sendRpcCommand('timeline.captureNow', {})
    if (result.captured && result.frame) {
      console.log(`${GREEN}✓ Captured window moment:${RESET}`)
      console.log(`  ${BOLD}ID:${RESET}         ${result.frame.id}`)
      console.log(`  ${BOLD}pHash:${RESET}      ${result.frame.phash}`)
      console.log(`  ${BOLD}Resolution:${RESET} ${result.frame.width}×${result.frame.height}`)
      console.log(`  ${BOLD}File:${RESET}       ${result.frame.screenshotPath}`)
    } else {
      console.log(`${YELLOW}⚠ Capture skipped or no active window detected.${RESET}`)
    }
  } catch (err) {
    console.error(`${RED}✗ ${err.message}${RESET}`)
    process.exit(1)
  }
}

async function cmdAutostart(action) {
  if (process.platform !== 'win32') {
    console.log(`${YELLOW}⚠ Autostart configuration via registry is only supported on Windows.${RESET}`)
    return
  }

  const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
  // Resolve relative to this file, not the caller's cwd (the old value broke
  // whenever `rewind autostart enable` was run from another directory), and
  // pass argv directly instead of building a shell string.
  const appPath = `"${process.execPath}" "${fileURLToPath(import.meta.url)}" start`

  switch (action) {
    case 'enable': {
      try {
        execFileSync('reg', ['add', regKey, '/v', 'REWIND', '/t', 'REG_SZ', '/d', appPath, '/f'], { stdio: 'pipe' })
        console.log(`${GREEN}✓ REWIND registered to start automatically on Windows login.${RESET}`)
      } catch (err) {
        console.error(`${RED}✗ Failed to enable autostart: ${err.message}${RESET}`)
        process.exit(1)
      }
      break
    }
    case 'disable': {
      try {
        execFileSync('reg', ['delete', regKey, '/v', 'REWIND', '/f'], { stdio: 'pipe' })
        console.log(`${GREEN}✓ REWIND removed from Windows startup registry.${RESET}`)
      } catch {
        console.log(`${YELLOW}ℹ REWIND was not registered in startup.${RESET}`)
      }
      break
    }
    case 'status':
    default: {
      try {
        const out = execFileSync('reg', ['query', regKey, '/v', 'REWIND'], { encoding: 'utf-8', stdio: 'pipe' })
        console.log(`${GREEN}● Autostart is ENABLED:${RESET}\n  ${out.trim()}`)
      } catch {
        console.log(`${DIM}○ Autostart is DISABLED.${RESET}`)
      }
      break
    }
  }
}

function printHelp() {
  console.log(`
${BOLD}↶ REWIND CLI${RESET} — Local-first system activity timeline

${CYAN}USAGE${RESET}
  rewind <command> [options]

${CYAN}COMMANDS${RESET}
  ${GREEN}start${RESET}                    Start the REWIND daemon in the background
  ${GREEN}stop${RESET}                     Stop the running daemon
  ${GREEN}status${RESET}                   Show daemon status and statistics
  ${GREEN}token${RESET}                    Print the daemon auth token (to pair the dashboard)
  ${GREEN}resurrect${RESET} <momentId> [--dry-run] Reopen the editor files, terminals and browser tabs from a moment
  ${GREEN}capture${RESET}                  Capture active window screenshot on demand
  ${GREEN}search${RESET} <query>           Full-text search across the timeline
  ${GREEN}undo${RESET}                     Trigger universal undo (Ctrl+Z to foreground app)
  ${GREEN}pause${RESET} [minutes]          Toggle recording pause (optional auto-resume)
  ${GREEN}autostart${RESET} <enable|disable|status> Manage Windows startup registration
  ${GREEN}export${RESET} [--branch <name>] Export provenance bundle for AI PR review
  ${GREEN}macro${RESET} export [options]        Export browser interactions as Playwright test script
  ${GREEN}help${RESET}                     Show this help message

${CYAN}EXAMPLES${RESET}
  ${DIM}rewind start${RESET}              # Launch background daemon
  ${DIM}rewind capture${RESET}            # Take instant snapshot of current window
  ${DIM}rewind search "login bug"${RESET} # Find moments mentioning "login bug"
  ${DIM}rewind pause 30${RESET}           # Pause recording for 30 minutes
  ${DIM}rewind resurrect m-123 --dry-run${RESET} # Preview what would be reopened
  ${DIM}rewind macro export --output ./flow.spec.ts${RESET} # Export Playwright test
  ${DIM}rewind autostart enable${RESET}   # Launch on Windows login
  ${DIM}rewind export --branch feat/auth${RESET}
`)
}

/* ── Main ───────────────────────────────────────────────────────── */

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]?.toLowerCase()

  switch (command) {
    case 'start':     return cmdStart()
    case 'stop':      return cmdStop()
    case 'status':    return cmdStatus()
    case 'token':     return cmdToken()
    case 'resurrect': return cmdResurrect(args.slice(1))
    case 'capture':   return cmdCapture()
    case 'search':    return cmdSearch(args.slice(1).join(' '))
    case 'undo':      return cmdUndo()
    case 'pause':     return cmdPause(args[1])
    case 'autostart': return cmdAutostart(args[1]?.toLowerCase())
    case 'macro':     return cmdMacro(args.slice(1))
    case 'export': {
      const branchIdx = args.indexOf('--branch')
      return cmdExport(branchIdx >= 0 ? args[branchIdx + 1] : undefined)
    }
    case 'help':
    case undefined:
      return printHelp()
    default:
      console.error(`${RED}✗ Unknown command: ${command}${RESET}`)
      printHelp()
      process.exit(1)
  }
}

// Only run when executed directly, so tests can import the helpers below.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`${RED}✗ Fatal: ${err.message}${RESET}`)
    process.exit(1)
  })
}

// Export for testing
export { sendRpcCommand, printHelp, readAuthToken, parseResurrectArgs, daemonEntryPath, cmdMacro }
