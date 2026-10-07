#!/usr/bin/env node

/**
 * REWIND CLI Control Suite
 * Subcommands: start | stop | status | search | undo | pause | export | help
 *
 * Communicates with the daemon via Named Pipe using NDJSON JSON-RPC 2.0.
 */

import { createConnection } from 'node:net'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

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

async function cmdStart() {
  console.log(`${CYAN}↶ REWIND Daemon starting...${RESET}`)
  try {
    // Spawn daemon as detached background process
    const daemonPath = new URL('../daemon/index.ts', import.meta.url).pathname
    // On Windows, strip leading slash from file URL pathname
    const resolved = process.platform === 'win32' ? daemonPath.slice(1) : daemonPath
    const child = spawn(process.execPath, ['--import', 'tsx', resolved], {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    })
    child.unref()
    console.log(`${GREEN}✓ Daemon spawned (PID: ${child.pid})${RESET}`)
    console.log(`${DIM}  Use 'rewind status' to check.${RESET}`)
  } catch (err) {
    console.error(`${RED}✗ Failed to start daemon: ${err.message}${RESET}`)
    process.exit(1)
  }
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
    const params = minutes ? { minutes: parseInt(minutes, 10) } : {}
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

  const { execSync } = await import('node:child_process')
  const regKey = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
  const appPath = `"${process.execPath}" "${join(process.cwd(), 'bin', 'rewind.js')}" start`

  switch (action) {
    case 'enable': {
      try {
        execSync(`reg add "${regKey}" /v "REWIND" /t REG_SZ /d ${appPath} /f`, { stdio: 'pipe' })
        console.log(`${GREEN}✓ REWIND registered to start automatically on Windows login.${RESET}`)
      } catch (err) {
        console.error(`${RED}✗ Failed to enable autostart: ${err.message}${RESET}`)
        process.exit(1)
      }
      break
    }
    case 'disable': {
      try {
        execSync(`reg delete "${regKey}" /v "REWIND" /f`, { stdio: 'pipe' })
        console.log(`${GREEN}✓ REWIND removed from Windows startup registry.${RESET}`)
      } catch {
        console.log(`${YELLOW}ℹ REWIND was not registered in startup.${RESET}`)
      }
      break
    }
    case 'status':
    default: {
      try {
        const out = execSync(`reg query "${regKey}" /v "REWIND"`, { encoding: 'utf-8', stdio: 'pipe' })
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
  ${GREEN}capture${RESET}                  Capture active window screenshot on demand
  ${GREEN}search${RESET} <query>           Full-text search across the timeline
  ${GREEN}undo${RESET}                     Trigger universal undo (Ctrl+Z to foreground app)
  ${GREEN}pause${RESET} [minutes]          Toggle recording pause (optional auto-resume)
  ${GREEN}autostart${RESET} <enable|disable|status> Manage Windows startup registration
  ${GREEN}export${RESET} [--branch <name>] Export provenance bundle for AI PR review
  ${GREEN}help${RESET}                     Show this help message

${CYAN}EXAMPLES${RESET}
  ${DIM}rewind start${RESET}              # Launch background daemon
  ${DIM}rewind capture${RESET}            # Take instant snapshot of current window
  ${DIM}rewind search "login bug"${RESET} # Find moments mentioning "login bug"
  ${DIM}rewind pause 30${RESET}           # Pause recording for 30 minutes
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
    case 'capture':   return cmdCapture()
    case 'search':    return cmdSearch(args.slice(1).join(' '))
    case 'undo':      return cmdUndo()
    case 'pause':     return cmdPause(args[1])
    case 'autostart': return cmdAutostart(args[1]?.toLowerCase())
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

main().catch((err) => {
  console.error(`${RED}✗ Fatal: ${err.message}${RESET}`)
  process.exit(1)
})

// Export for testing
export { sendRpcCommand, printHelp, readAuthToken }
