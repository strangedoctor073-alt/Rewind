/**
 * Phase 5.3: browser multi-tab session replay.
 *
 * Reads the `browser_events` the Chrome extension recorded and works out which
 * tabs were open around a moment: the latest event per tab inside a lookback
 * window. Each tab becomes a launch step that opens its URL in the user's
 * default browser through the OS protocol handler.
 *
 * Known limits (documented, not hidden):
 *  - The daemon has no WebSocket bridge to the extension, so scroll positions
 *    are carried in the plan but only the extension-side handler
 *    (`REWIND_RESTORE_TABS` in extension/background.js) can apply them, and
 *    only to tabs that are still open.
 *  - Only http(s) URLs are ever opened, with any embedded credentials removed.
 */

import type { DbBrowserEvent } from '../../db/timelineDb.js'
import { isWindowAllowed } from '../../privacy.js'
import { isSafeLaunchUrl, urlLaunch } from '../launcher.js'
import type { ResurrectStep } from '../types.js'

export interface BrowserTab {
  url: string
  title?: string
  scrollX?: number
  scrollY?: number
  tabId?: number
  lastSeen: number
}

export interface BrowserPlanOptions {
  /** How far before the moment to look for tab activity. Default 30 minutes. */
  lookbackMs?: number
  /** Cap on tabs reopened, to avoid tab-bombing. Default 12. */
  maxTabs?: number
}

/** Normalise to a safe http(s) URL without credentials, or null. */
export function sanitizeTabUrl(raw: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (!parsed.hostname) return null
  parsed.username = ''
  parsed.password = ''
  const href = parsed.href
  return isSafeLaunchUrl(href, ['http', 'https']) ? href : null
}

/** Work out which tabs were open at `atTimestamp`. */
export function planBrowserTabs(
  events: DbBrowserEvent[],
  atTimestamp: number,
  options: BrowserPlanOptions = {},
): { tabs: BrowserTab[]; dropped: number } {
  const lookbackMs = options.lookbackMs ?? 30 * 60_000
  const maxTabs = options.maxTabs ?? 12
  const since = atTimestamp - lookbackMs

  const latest = new Map<string, BrowserTab>()
  let dropped = 0

  for (const event of events) {
    if (event.timestamp > atTimestamp || event.timestamp < since) continue

    const url = sanitizeTabUrl(event.url)
    if (!url || !isWindowAllowed(undefined, event.pageTitle)) {
      dropped += 1
      continue
    }

    // Events without a tab id are grouped by page (origin + path).
    const key = event.tabId !== undefined ? `tab:${event.tabId}` : `page:${new URL(url).origin}${new URL(url).pathname}`
    const previous = latest.get(key)
    if (!previous || event.timestamp >= previous.lastSeen) {
      latest.set(key, {
        url,
        title: event.pageTitle,
        scrollX: event.scrollX,
        scrollY: event.scrollY,
        tabId: event.tabId,
        lastSeen: event.timestamp,
      })
    }
  }

  // Oldest first so the most recently used tab is opened last (and ends up focused).
  const ordered = [...latest.values()].sort((a, b) => a.lastSeen - b.lastSeen)
  const kept = ordered.slice(-maxTabs)
  dropped += ordered.length - kept.length
  return { tabs: kept, dropped }
}

export class BrowserReplayAdapter {
  readonly id = 'browser'

  private readonly getEvents: (since: number, until: number) => DbBrowserEvent[]

  constructor(getEvents: (since: number, until: number) => DbBrowserEvent[]) {
    this.getEvents = getEvents
  }

  plan(atTimestamp: number, options: BrowserPlanOptions = {}): ResurrectStep[] {
    const lookbackMs = options.lookbackMs ?? 30 * 60_000
    const events = this.getEvents(atTimestamp - lookbackMs, atTimestamp)
    const { tabs, dropped } = planBrowserTabs(events, atTimestamp, options)

    const steps: ResurrectStep[] = tabs.map((tab) => ({
      kind: 'browser',
      label: `Tab: ${tab.title || new URL(tab.url).hostname}`,
      launch: urlLaunch(tab.url),
      notes: tab.scrollY ? [`Was scrolled to ${Math.round(tab.scrollY)}px; scroll is only restorable in tabs that are still open.`] : [],
    }))

    if (dropped > 0) {
      steps.push({
        kind: 'browser',
        label: `${dropped} tab${dropped === 1 ? '' : 's'} not reopened`,
        unresolved: 'Skipped: non-http(s) address, sensitive page title, or over the tab limit.',
      })
    }
    return steps
  }
}
