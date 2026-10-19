import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { TimelineDatabase } from '../timelineDb'

describe('TimelineDatabase', () => {
  let db: TimelineDatabase

  beforeEach(() => {
    // In-memory database for isolated, high-speed testing
    db = new TimelineDatabase(':memory:')
  })

  afterEach(() => {
    db.close()
  })

  it('inserts and retrieves moments in chronological descending order', () => {
    db.insertMoment({
      id: 'm1',
      timestamp: 1000,
      appName: 'Code.exe',
      windowTitle: 'auth.ts - REWIND',
      processPath: 'C:\\Users\\dev\\Code.exe',
    })

    db.insertMoment({
      id: 'm2',
      timestamp: 2000,
      appName: 'chrome.exe',
      windowTitle: 'Google Chrome',
      processPath: 'C:\\Program Files\\Chrome\\chrome.exe',
    })

    const moments = db.getMoments({ limit: 10 })
    expect(moments).toHaveLength(2)
    expect(moments[0].id).toBe('m2') // Most recent first
    expect(moments[1].id).toBe('m1')
  })

  it('filters moments by app and time range', () => {
    db.insertMoment({ id: 'm1', timestamp: 1000, appName: 'Code.exe', windowTitle: 'file1.ts' })
    db.insertMoment({ id: 'm2', timestamp: 2000, appName: 'Terminal.exe', windowTitle: 'bash' })
    db.insertMoment({ id: 'm3', timestamp: 3000, appName: 'Code.exe', windowTitle: 'file2.ts' })

    const codeOnly = db.getMoments({ app: 'Code.exe' })
    expect(codeOnly).toHaveLength(2)
    expect(codeOnly.map((m) => m.id)).toEqual(['m3', 'm1'])

    const timeFiltered = db.getMoments({ since: 1500, until: 2500 })
    expect(timeFiltered).toHaveLength(1)
    expect(timeFiltered[0].id).toBe('m2')
  })

  it('indexes and searches content via FTS5 full-text indexing', () => {
    db.insertMoment({
      id: 'm1',
      timestamp: 1000,
      appName: 'Code.exe',
      windowTitle: 'AuthenticationMiddleware.ts - REWIND',
    })

    db.insertMoment({
      id: 'm2',
      timestamp: 2000,
      appName: 'Spotify.exe',
      windowTitle: 'Daft Punk - Discovery',
    })

    const results = db.searchFts('Authentication')
    expect(results).toHaveLength(1)
    expect(results[0].moment_id).toBe('m1')

    const spotifyResults = db.searchFts('Daft Punk')
    expect(spotifyResults).toHaveLength(1)
    expect(spotifyResults[0].moment_id).toBe('m2')
  })

  it('updates FTS index when OCR tokens are appended to a moment', () => {
    db.insertMoment({
      id: 'm1',
      timestamp: 1000,
      appName: 'WindowsTerminal.exe',
      windowTitle: 'PowerShell',
    })

    db.insertOcrTokens('m1', [
      { id: 't1', word: 'DATABASE_URL', x: 10, y: 20, width: 80, height: 16 },
      { id: 't2', word: 'CONNECTION_ERROR_504', x: 95, y: 20, width: 120, height: 16 },
    ])

    const ocrSearchResults = db.searchFts('CONNECTION_ERROR')
    expect(ocrSearchResults).toHaveLength(1)
    expect(ocrSearchResults[0].moment_id).toBe('m1')
  })

  it('stores and correlates browser events', () => {
    db.insertMoment({ id: 'm1', timestamp: 1000, appName: 'chrome.exe', windowTitle: 'GitHub' })

    db.insertBrowserEvent({
      id: 'be1',
      momentId: 'm1',
      tabId: 101,
      url: 'https://github.com/strangedoctor073-alt/Rewind',
      pageTitle: 'REWIND Repository',
      eventKind: 'click',
      selector: '#submit-pr-button',
      timestamp: 1050,
    })

    const record = db.db.prepare('SELECT * FROM browser_events WHERE id = ?').get('be1') as Record<string, unknown>
    expect(record).toBeDefined()
    expect(record.url).toBe('https://github.com/strangedoctor073-alt/Rewind')
    expect(record.selector).toBe('#submit-pr-button')
  })
  it('countMoments counts every row, not just a page of them', () => {
    for (let i = 0; i < 120; i++) db.insertMoment({ id: `c${i}`, timestamp: i, appName: 'a.exe', windowTitle: 't' })
    expect(db.countMoments()).toBe(120)
    expect(db.getMoments()).toHaveLength(50) // default page size, which is why counting by length was wrong
  })

  it('clamps limit and offset from untrusted callers', () => {
    for (let i = 0; i < 5; i++) db.insertMoment({ id: `l${i}`, timestamp: i, appName: 'a.exe', windowTitle: 't' })
    expect(db.getMoments({ limit: -3 })).toHaveLength(1)
    expect(db.getMoments({ limit: Number.NaN })).toHaveLength(5)
    expect(db.getMoments({ limit: 5, offset: -10 })).toHaveLength(5)
  })

  it('purgeOlderThan removes old moments, their search entries and returns screenshot paths', () => {
    db.insertMoment({ id: 'old', timestamp: 1000, appName: 'a.exe', windowTitle: 'ancient zebra', screenshotPath: '/shots/old.bmp' })
    db.insertMoment({ id: 'new', timestamp: 9000, appName: 'a.exe', windowTitle: 'recent zebra', screenshotPath: '/shots/new.bmp' })
    db.insertBrowserEvent({ id: 'be-old', url: 'https://a.test/', eventKind: 'navigate', timestamp: 1000 })
    db.insertBrowserEvent({ id: 'be-new', url: 'https://b.test/', eventKind: 'navigate', timestamp: 9000 })

    const result = db.purgeOlderThan(5000)

    expect(result).toEqual({ removed: 1, screenshotPaths: ['/shots/old.bmp'] })
    expect(db.countMoments()).toBe(1)
    expect(db.searchFts('zebra').map((r) => r.moment_id)).toEqual(['new'])
    expect(db.getBrowserEventsBetween(0, 10000).map((e) => e.id)).toEqual(['be-new'])
  })

  it('getBrowserEventsBetween returns events in range, oldest first, as camelCase', () => {
    db.insertBrowserEvent({ id: 'b2', tabId: 3, url: 'https://x.test/2', pageTitle: 'Two', eventKind: 'scroll', scrollY: 250, timestamp: 2000 })
    db.insertBrowserEvent({ id: 'b1', tabId: 3, url: 'https://x.test/1', eventKind: 'navigate', timestamp: 1000 })
    db.insertBrowserEvent({ id: 'b3', url: 'https://x.test/3', eventKind: 'navigate', timestamp: 9000 })
    const events = db.getBrowserEventsBetween(500, 2500)
    expect(events.map((e) => e.id)).toEqual(['b1', 'b2'])
    expect(events[1]).toMatchObject({ tabId: 3, pageTitle: 'Two', scrollY: 250 })
  })

  it('inserts, retrieves, and searches clipboard entries', () => {
    db.insertClipboardEntry({
      id: 'c1',
      contentText: 'const API_KEY = "my-secret"',
      entropyScore: 4.8,
      isRedacted: 1,
      timestamp: 1000,
    })
    db.insertClipboardEntry({
      id: 'c2',
      contentText: 'git checkout -b feature/auth',
      entropyScore: 2.1,
      isRedacted: 0,
      timestamp: 2000,
    })

    const history = db.getClipboardHistory(10)
    expect(history).toHaveLength(2)
    expect(history[0].id).toBe('c2') // Newest first
    expect(history[1].id).toBe('c1')

    const searchResults = db.searchClipboard('feature')
    expect(searchResults).toHaveLength(1)
    expect(searchResults[0].id).toBe('c2')
  })

  it('purgeOldMoments purges moments older than given days', () => {
    const now = Date.now()
    const sixDaysAgo = now - 6 * 24 * 60 * 60 * 1000
    const fourDaysAgo = now - 4 * 24 * 60 * 60 * 1000

    db.insertMoment({ id: 'm-old', timestamp: sixDaysAgo, appName: 'old.exe', windowTitle: 'old' })
    db.insertMoment({ id: 'm-new', timestamp: fourDaysAgo, appName: 'new.exe', windowTitle: 'new' })

    const result = db.purgeOldMoments(5)
    expect(result.deletedCount).toBe(1)
    expect(db.countMoments()).toBe(1)
    expect(db.getMomentById('m-old')).toBeUndefined()
    expect(db.getMomentById('m-new')).toBeDefined()
  })

  it('checkpoint runs without error', () => {
    expect(() => db.checkpoint()).not.toThrow()
  })
})
