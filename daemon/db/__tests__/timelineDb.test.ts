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
})
