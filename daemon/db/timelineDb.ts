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
    const { limit = 50, offset = 0, since, until, app } = options
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

  public close(): void {
    this.db.close()
  }
}
