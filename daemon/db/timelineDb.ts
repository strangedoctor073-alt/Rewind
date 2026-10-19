/**
 * REWIND Local-First Timeline Database Engine
 * Backed by better-sqlite3 with WAL mode, foreign keys, and FTS5 full-text indexing.
 */

import Database, { type Database as DatabaseType } from 'better-sqlite3'

export interface DbMoment {
  id: string
  timestamp: number
  appName: string
  windowTitle: string
  processPath?: string
  pid?: number
  boundsX?: number
  boundsY?: number
  boundsW?: number
  boundsH?: number
  phash?: string
  screenshotPath?: string
  isClosed?: number
}

export interface DbOcrToken {
  id: string
  momentId: string
  word: string
  x: number
  y: number
  width: number
  height: number
  confidence?: number
}

export interface DbBrowserEvent {
  id: string
  momentId?: string
  tabId?: number
  url: string
  pageTitle?: string
  eventKind: 'click' | 'type' | 'scroll' | 'navigate'
  selector?: string
  scrollX?: number
  scrollY?: number
  timestamp: number
}

export interface DbClipboardEntry {
  id: string
  momentId?: string
  contentText: string
  entropyScore?: number
  isRedacted?: number
  timestamp: number
}

export class TimelineDatabase {
  public db: DatabaseType

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath)
    this.initPragmas()
    this.initSchema()
  }

  private initPragmas(): void {
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('foreign_keys = ON')
    this.db.pragma('synchronous = NORMAL')
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS moments (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        app_name TEXT NOT NULL,
        window_title TEXT NOT NULL,
        process_path TEXT,
        pid INTEGER,
        bounds_x INTEGER,
        bounds_y INTEGER,
        bounds_w INTEGER,
        bounds_h INTEGER,
        phash TEXT,
        screenshot_path TEXT,
        is_closed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_moments_timestamp ON moments(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_moments_app ON moments(app_name);

      CREATE TABLE IF NOT EXISTS ocr_tokens (
        id TEXT PRIMARY KEY,
        moment_id TEXT NOT NULL REFERENCES moments(id) ON DELETE CASCADE,
        word TEXT NOT NULL,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        confidence REAL
      );

      CREATE INDEX IF NOT EXISTS idx_ocr_moment ON ocr_tokens(moment_id);

      CREATE TABLE IF NOT EXISTS browser_events (
        id TEXT PRIMARY KEY,
        moment_id TEXT REFERENCES moments(id) ON DELETE SET NULL,
        tab_id INTEGER,
        url TEXT NOT NULL,
        page_title TEXT,
        event_kind TEXT NOT NULL,
        selector TEXT,
        scroll_x INTEGER,
        scroll_y INTEGER,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_browser_events_timestamp ON browser_events(timestamp DESC);

      CREATE TABLE IF NOT EXISTS clipboard_history (
        id TEXT PRIMARY KEY,
        moment_id TEXT REFERENCES moments(id) ON DELETE SET NULL,
        content_text TEXT NOT NULL,
        entropy_score REAL,
        is_redacted INTEGER DEFAULT 0,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_clipboard_timestamp ON clipboard_history(timestamp DESC);

      CREATE VIRTUAL TABLE IF NOT EXISTS timeline_fts USING fts5(
        moment_id UNINDEXED,
        app_name,
        window_title,
        ocr_content,
        dom_content,
        tokenize = 'porter unicode61'
      );
    `)
  }

  public insertMoment(moment: DbMoment): void {
    // Row + FTS entry must land together or not at all.
    this.db.transaction(() => this.insertMomentRow(moment))()
  }

  private insertMomentRow(moment: DbMoment): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO moments (
        id, timestamp, app_name, window_title, process_path, pid,
        bounds_x, bounds_y, bounds_w, bounds_h, phash, screenshot_path, is_closed
      ) VALUES (
        @id, @timestamp, @appName, @windowTitle, @processPath, @pid,
        @boundsX, @boundsY, @boundsW, @boundsH, @phash, @screenshotPath, @isClosed
      )
    `)

    stmt.run({
      id: moment.id,
      timestamp: moment.timestamp,
      appName: moment.appName,
      windowTitle: moment.windowTitle,
      processPath: moment.processPath ?? null,
      pid: moment.pid ?? null,
      boundsX: moment.boundsX ?? null,
      boundsY: moment.boundsY ?? null,
      boundsW: moment.boundsW ?? null,
      boundsH: moment.boundsH ?? null,
      phash: moment.phash ?? null,
      screenshotPath: moment.screenshotPath ?? null,
      isClosed: moment.isClosed ?? 0,
    })

    // Sync FTS entry
    this.updateFts(moment.id, moment.appName, moment.windowTitle, '', '')
  }

  public updateFts(
    momentId: string,
    appName: string,
    windowTitle: string,
    ocrContent: string = '',
    domContent: string = ''
  ): void {
    const deleteStmt = this.db.prepare('DELETE FROM timeline_fts WHERE moment_id = ?')
    deleteStmt.run(momentId)

    const insertStmt = this.db.prepare(`
      INSERT INTO timeline_fts (moment_id, app_name, window_title, ocr_content, dom_content)
      VALUES (?, ?, ?, ?, ?)
    `)
    insertStmt.run(momentId, appName, windowTitle, ocrContent, domContent)
  }

  public insertOcrTokens(momentId: string, tokens: Array<Omit<DbOcrToken, 'momentId'>>): void {
    const insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO ocr_tokens (id, moment_id, word, x, y, width, height, confidence)
      VALUES (@id, @momentId, @word, @x, @y, @width, @height, @confidence)
    `)

    const ocrWords: string[] = []
    const insertMany = this.db.transaction((items: Array<Omit<DbOcrToken, 'momentId'>>) => {
      for (const token of items) {
        insertStmt.run({
          id: token.id,
          momentId,
          word: token.word,
          x: token.x,
          y: token.y,
          width: token.width,
          height: token.height,
          confidence: token.confidence ?? null,
        })
        ocrWords.push(token.word)
      }
    })

    insertMany(tokens)

    // Update FTS with appended OCR words
    const moment = this.getMomentById(momentId)
    if (moment) {
      this.updateFts(String(moment.id), String(moment.app_name), String(moment.window_title), ocrWords.join(' '), '')
    }
  }

  public insertBrowserEvent(event: DbBrowserEvent): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO browser_events (
        id, moment_id, tab_id, url, page_title, event_kind, selector, scroll_x, scroll_y, timestamp
      ) VALUES (
        @id, @momentId, @tabId, @url, @pageTitle, @eventKind, @selector, @scrollX, @scrollY, @timestamp
      )
    `)

    stmt.run({
      id: event.id,
      momentId: event.momentId ?? null,
      tabId: event.tabId ?? null,
      url: event.url,
      pageTitle: event.pageTitle ?? null,
      eventKind: event.eventKind,
      selector: event.selector ?? null,
      scrollX: event.scrollX ?? null,
      scrollY: event.scrollY ?? null,
      timestamp: event.timestamp,
    })
  }

  public insertClipboard(entry: DbClipboardEntry): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO clipboard_history (
        id, moment_id, content_text, entropy_score, is_redacted, timestamp
      ) VALUES (
        @id, @momentId, @contentText, @entropyScore, @isRedacted, @timestamp
      )
    `)

    stmt.run({
      id: entry.id,
      momentId: entry.momentId ?? null,
      contentText: entry.contentText,
      entropyScore: entry.entropyScore ?? null,
      isRedacted: entry.isRedacted ?? 0,
      timestamp: entry.timestamp,
    })
  }

  public getMomentById(id: string): Record<string, unknown> | undefined {
    return this.db.prepare('SELECT * FROM moments WHERE id = ?').get(id) as Record<string, unknown> | undefined
  }

  public getMoments(options: { limit?: number; offset?: number; since?: number; until?: number; app?: string } = {}): Record<string, unknown>[] {
    const { since, until, app } = options
    // Callers pass untrusted RPC params: clamp so a huge/negative/NaN limit
    // cannot dump the whole table or make SQLite throw.
    const limit = clampInt(options.limit, 50, 1, 1000)
    const offset = clampInt(options.offset, 0, 0, Number.MAX_SAFE_INTEGER)
    const conditions: string[] = []
    const params: (string | number)[] = []

    if (since !== undefined) {
      conditions.push('timestamp >= ?')
      params.push(since)
    }
    if (until !== undefined) {
      conditions.push('timestamp <= ?')
      params.push(until)
    }
    if (app !== undefined) {
      conditions.push('app_name = ?')
      params.push(app)
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const sql = `SELECT * FROM moments ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    return this.db.prepare(sql).all(...params) as Record<string, unknown>[]
  }

  public searchFts(query: string, limit = 20): Array<{ moment_id: string; rank: number; snippet: string }> {
    if (!query || !query.trim()) return []
    // Sanitize query for FTS5 (escape internal quotes)
    const sanitized = query.replace(/"/g, '""').trim()
    const ftsQuery = `"${sanitized}"*`

    const sql = `
      SELECT moment_id, rank, snippet(timeline_fts, 2, '<b>', '</b>', '...', 10) as snippet
      FROM timeline_fts
      WHERE timeline_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `

    try {
      return this.db.prepare(sql).all(ftsQuery, limit) as Array<{ moment_id: string; rank: number; snippet: string }>
    } catch {
      // Fallback if syntax error in complex match
      return []
    }
  }

  /** Total number of stored moments (cheap; does not load rows). */
  public countMoments(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM moments').get() as { n: number }
    return row.n
  }

  /**
   * Browser interaction events with `since <= timestamp <= until`, oldest first.
   * Used by workspace resurrection to find which tabs were open at a moment.
   */
  public getBrowserEventsBetween(since: number, until: number, limit = 500): DbBrowserEvent[] {
    const rows = this.db
      .prepare(
        `SELECT id, moment_id AS momentId, tab_id AS tabId, url, page_title AS pageTitle,
                event_kind AS eventKind, selector, scroll_x AS scrollX, scroll_y AS scrollY, timestamp
         FROM browser_events
         WHERE timestamp >= ? AND timestamp <= ?
         ORDER BY timestamp ASC
         LIMIT ?`,
      )
      .all(since, until, clampInt(limit, 500, 1, 5000)) as Array<Record<string, unknown>>
    return rows.map((r) => ({
      id: String(r.id),
      momentId: r.momentId == null ? undefined : String(r.momentId),
      tabId: r.tabId == null ? undefined : Number(r.tabId),
      url: String(r.url),
      pageTitle: r.pageTitle == null ? undefined : String(r.pageTitle),
      eventKind: r.eventKind as DbBrowserEvent['eventKind'],
      selector: r.selector == null ? undefined : String(r.selector),
      scrollX: r.scrollX == null ? undefined : Number(r.scrollX),
      scrollY: r.scrollY == null ? undefined : Number(r.scrollY),
      timestamp: Number(r.timestamp),
    }))
  }

  /**
   * Clipboard history query, ordered newest first.
   */
  public getClipboardHistory(limit = 50, offset = 0): DbClipboardEntry[] {
    const rows = this.db
      .prepare(
        `SELECT id, moment_id AS momentId, content_text AS contentText,
                entropy_score AS entropyScore, is_redacted AS isRedacted, timestamp
         FROM clipboard_history
         ORDER BY timestamp DESC
         LIMIT ? OFFSET ?`,
      )
      .all(clampInt(limit, 50, 1, 500), Math.max(0, clampInt(offset, 0, 0, 100000))) as Array<Record<string, unknown>>
    return rows.map((r) => ({
      id: String(r.id),
      momentId: r.momentId == null ? undefined : String(r.momentId),
      contentText: String(r.contentText),
      entropyScore: r.entropyScore == null ? undefined : Number(r.entropyScore),
      isRedacted: r.isRedacted == null ? 0 : Number(r.isRedacted),
      timestamp: Number(r.timestamp),
    }))
  }

  /**
   * Search clipboard text in clipboard_history.
   */
  public searchClipboard(query: string, limit = 50): DbClipboardEntry[] {
    const q = `%${query.replace(/[%_]/g, '')}%`
    const rows = this.db
      .prepare(
        `SELECT id, moment_id AS momentId, content_text AS contentText,
                entropy_score AS entropyScore, is_redacted AS isRedacted, timestamp
         FROM clipboard_history
         WHERE content_text LIKE ?
         ORDER BY timestamp DESC
         LIMIT ?`,
      )
      .all(q, clampInt(limit, 50, 1, 500)) as Array<Record<string, unknown>>
    return rows.map((r) => ({
      id: String(r.id),
      momentId: r.momentId == null ? undefined : String(r.momentId),
      contentText: String(r.contentText),
      entropyScore: r.entropyScore == null ? undefined : Number(r.entropyScore),
      isRedacted: r.isRedacted == null ? 0 : Number(r.isRedacted),
      timestamp: Number(r.timestamp),
    }))
  }

  public insertClipboardEntry(entry: DbClipboardEntry): void {
    this.db
      .prepare(
        `INSERT INTO clipboard_history (id, moment_id, content_text, entropy_score, is_redacted, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        entry.id,
        entry.momentId ?? null,
        entry.contentText,
        entry.entropyScore ?? null,
        entry.isRedacted ?? 0,
        entry.timestamp,
      )
  }

  /**
   * Retention: delete everything older than `cutoffMs` (epoch ms).
   * Without this the database grew without bound once capture is live.
   * Returns the screenshot files that belonged to the deleted moments so the
   * caller can remove them from disk too.
   */
  public purgeOlderThan(cutoffMs: number): { removed: number; screenshotPaths: string[] } {
    return this.db.transaction(() => {
      const old = this.db
        .prepare('SELECT id, screenshot_path AS screenshotPath FROM moments WHERE timestamp < ?')
        .all(cutoffMs) as Array<{ id: string; screenshotPath: string | null }>

      // FTS5 rows are not covered by ON DELETE CASCADE.
      this.db
        .prepare('DELETE FROM timeline_fts WHERE moment_id IN (SELECT id FROM moments WHERE timestamp < ?)')
        .run(cutoffMs)
      this.db.prepare('DELETE FROM moments WHERE timestamp < ?').run(cutoffMs)
      this.db.prepare('DELETE FROM browser_events WHERE timestamp < ?').run(cutoffMs)
      this.db.prepare('DELETE FROM clipboard_history WHERE timestamp < ?').run(cutoffMs)
      return {
        removed: old.length,
        screenshotPaths: old.map((m) => m.screenshotPath).filter((p): p is string => !!p),
      }
    })()
  }

  /**
   * Retention: purge moments older than `retentionDays`.
   * retentionDays <= 0 means Unlimited (no deletion).
   */
  public purgeOldMoments(retentionDays: number = 5): { deletedCount: number; screenshotPaths: string[] } {
    if (retentionDays <= 0) return { deletedCount: 0, screenshotPaths: [] }
    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    const res = this.purgeOlderThan(cutoffMs)
    return { deletedCount: res.removed, screenshotPaths: res.screenshotPaths }
  }

  /** Fold the WAL into the main database file so it cannot grow unbounded. */
  public checkpoint(): void {
    this.db.pragma('wal_checkpoint(PASSIVE)')
  }

  public close(): void {
    this.db.close()
  }
}

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(value)))
}
