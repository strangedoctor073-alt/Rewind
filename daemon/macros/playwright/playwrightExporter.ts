/**
 * REWIND Playwright TypeScript Test Script Generator
 * Converts recorded browser interaction sequences into clean, idiomatic Playwright test code.
 */

import type { MacroBrowserEvent, PlaywrightExportOptions, MacroExportResult } from '../types.js'

function sanitizeSelector(selector: string): string {
  return selector.trim()
}

function toEnvVarName(key: string, index: number): string {
  const clean = key.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 30)
  return clean ? `SECRET_${clean}` : `SECRET_INPUT_${index + 1}`
}

function isSensitive(event: MacroBrowserEvent): boolean {
  if (event.masked) return true
  if (event.value === '[MASKED]') return true
  const target = (event.target || event.selector || '').toLowerCase()
  return /password|secret|token|apikey|api_key|auth|credit|cvv|pin/i.test(target)
}

export class PlaywrightExporter {
  public static export(
    events: MacroBrowserEvent[],
    options: PlaywrightExportOptions = {}
  ): MacroExportResult {
    const testName = options.testName || 'rewind generated user flow'
    const defaultTimeoutMs = options.defaultTimeoutMs ?? 30000
    const useEnv = options.useEnvSecrets ?? true

    const lines: string[] = []
    const secretsMap = new Map<string, string>() // envVarName -> selector
    let stepCount = 0
    let lastUrl = ''

    lines.push(`import { test, expect } from '@playwright/test';`)
    lines.push(``)
    lines.push(`test.describe('REWIND Replay: ${testName.replace(/'/g, "\\'")}', () => {`)
    lines.push(`  test('${testName.replace(/'/g, "\\'")}', async ({ page }) => {`)
    lines.push(`    test.setTimeout(${defaultTimeoutMs});`)
    lines.push(``)

    for (const evt of events) {
      if (evt.url && evt.url !== lastUrl) {
        stepCount++
        lines.push(`    // Step ${stepCount}: Navigate to ${evt.url}`)
        lines.push(`    await page.goto(${JSON.stringify(evt.url)}, { waitUntil: 'domcontentloaded' });`)
        lines.push(``)
        lastUrl = evt.url
      }

      switch (evt.kind) {
        case 'navigate': {
          if (evt.url && evt.url !== lastUrl) {
            stepCount++
            lines.push(`    // Step ${stepCount}: Navigate to ${evt.url}`)
            lines.push(`    await page.goto(${JSON.stringify(evt.url)}, { waitUntil: 'domcontentloaded' });`)
            lines.push(``)
            lastUrl = evt.url
          }
          break
        }

        case 'click': {
          if (!evt.selector) break
          stepCount++
          const label = evt.label ? ` (${evt.label})` : ''
          lines.push(`    // Step ${stepCount}: Click ${sanitizeSelector(evt.selector)}${label}`)
          lines.push(`    await page.locator(${JSON.stringify(sanitizeSelector(evt.selector))}).click();`)
          lines.push(``)
          break
        }

        case 'type': {
          if (!evt.selector) break
          stepCount++
          const sensitive = isSensitive(evt)
          if (sensitive && useEnv) {
            const envName = toEnvVarName(evt.target || evt.selector, secretsMap.size)
            secretsMap.set(envName, evt.selector)
            lines.push(`    // Step ${stepCount}: Fill masked input ${sanitizeSelector(evt.selector)}`)
            lines.push(`    const ${envName} = process.env.${envName} || '';`)
            lines.push(`    await page.locator(${JSON.stringify(sanitizeSelector(evt.selector))}).fill(${envName});`)
          } else {
            const val = evt.value ?? ''
            lines.push(`    // Step ${stepCount}: Fill ${sanitizeSelector(evt.selector)}`)
            lines.push(`    await page.locator(${JSON.stringify(sanitizeSelector(evt.selector))}).fill(${JSON.stringify(val)});`)
          }
          lines.push(``)
          break
        }

        case 'scroll': {
          if (typeof evt.scrollY === 'number' || typeof evt.scrollX === 'number') {
            const x = evt.scrollX ?? 0
            const y = evt.scrollY ?? 0
            stepCount++
            lines.push(`    // Step ${stepCount}: Scroll to coordinates (${x}, ${y})`)
            lines.push(`    await page.evaluate(({ x, y }) => window.scrollTo(x, y), { x: ${x}, y: ${y} });`)
            lines.push(``)
          }
          break
        }
      }
    }

    if (options.generateAssertions && lastUrl) {
      lines.push(`    // Final Assertion: Verify page loaded`)
      lines.push(`    await expect(page).toHaveURL(/${escapeRegex(new URL(lastUrl).hostname)}/);`)
      lines.push(``)
    }

    lines.push(`  });`)
    lines.push(`});`)
    lines.push(``)

    return {
      code: lines.join('\n'),
      stepsCount: stepCount,
      secretsUsed: Array.from(secretsMap.keys()),
      format: 'playwright',
    }
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
