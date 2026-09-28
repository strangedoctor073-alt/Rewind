/**
 * REWIND Desktop Instant OCR & Click-to-Copy Engine
 * Indexes on-screen text, errors, URLs, and commands, providing sub-millisecond
 * search and clickable text bounding boxes for 1-click clipboard extraction.
 */

export class OcrEngine {
  constructor() {
    this.index = new Map() // id -> { text, tokens: [{ word, x, y, width, height }] }
  }

  /**
   * Converts plain text or terminal output into positioned text tokens.
   * Simulates OCR layout analysis with exact character and word coordinates.
   * @param {string} text
   * @param {number} [containerWidth=800]
   * @param {number} [containerHeight=600]
   * @returns {Array<{ word: string, x: number, y: number, width: number, height: number }>}
   */
  static tokenizeText(text, containerWidth = 800, containerHeight = 600) {
    if (!text) return []

    const lines = text.split('\n')
    const tokens = []
    const lineHeight = 20
    const charWidth = 8

    lines.forEach((line, lineIdx) => {
      const y = 30 + lineIdx * lineHeight
      if (y > containerHeight - 20) return

      let col = 0
      const words = line.split(/(\s+)/)

      words.forEach((word) => {
        if (!word) return
        if (/^\s+$/.test(word)) {
          col += word.length
          return
        }

        const x = 20 + col * charWidth
        const width = Math.min(containerWidth - x, word.length * charWidth)

        tokens.push({
          word,
          cleanWord: word.replace(/[^\w.-]/g, ''),
          x,
          y,
          width,
          height: lineHeight - 4,
        })

        col += word.length
      })
    })

    return tokens
  }

  /**
   * Indexes a snapshot's visual/textual content.
   * @param {string} id
   * @param {string} text
   * @param {object} [metadata]
   */
  indexSnapshot(id, text, metadata = {}) {
    if (!id) return
    const content = text || ''
    const tokens = OcrEngine.tokenizeText(content)
    this.index.set(id, {
      id,
      text: content.toLowerCase(),
      rawText: content,
      tokens,
      metadata,
      indexedAt: Date.now(),
    })
  }

  /**
   * Searches indexed moments for matching text or commands.
   * @param {string} query
   * @returns {Array<{ id: string, matches: Array<string>, score: number, metadata: object }>}
   */
  search(query) {
    if (!query || !query.trim()) return []
    const q = query.trim().toLowerCase()
    const results = []

    for (const [id, entry] of this.index.entries()) {
      if (entry.text.includes(q)) {
        // Find matching tokens
        const matchedTokens = entry.tokens.filter(
          (t) => t.word.toLowerCase().includes(q) || q.includes(t.word.toLowerCase())
        )

        // Calculate relevance score (exact word match scores higher)
        let score = 1
        if (entry.text.startsWith(q)) score += 2
        if (entry.tokens.some((t) => t.cleanWord.toLowerCase() === q)) score += 5

        results.push({
          id,
          rawText: entry.rawText,
          matches: matchedTokens.map((t) => t.word),
          tokens: matchedTokens,
          score,
          metadata: entry.metadata,
        })
      }
    }

    return results.sort((a, b) => b.score - a.score)
  }

  /**
   * Retrieves clickable tokens for a specific snapshot so user can hover and copy.
   * @param {string} id
   * @returns {Array<{ word: string, x: number, y: number, width: number, height: number }>}
   */
  getTokens(id) {
    return this.index.get(id)?.tokens || []
  }

  /**
   * Clears the index.
   */
  clear() {
    this.index.clear()
  }
}
