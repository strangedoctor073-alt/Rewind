import { describe, it, expect } from 'vitest'
import { PlaywrightExporter } from '../playwright/playwrightExporter.js'
import type { MacroBrowserEvent } from '../types.js'

describe('PlaywrightExporter', () => {
  it('generates a clean Playwright test with navigation, clicks, and inputs', () => {
    const events: MacroBrowserEvent[] = [
      {
        kind: 'navigate',
        url: 'https://example.com/login',
        timestamp: 1000,
      },
      {
        kind: 'type',
        selector: 'input#username',
        value: 'testuser',
        timestamp: 2000,
      },
      {
        kind: 'click',
        selector: 'button#submit',
        label: 'Log In Button',
        timestamp: 3000,
      },
    ]

    const result = PlaywrightExporter.export(events, { testName: 'User Login Flow' })

    expect(result.format).toBe('playwright')
    expect(result.stepsCount).toBe(3)
    expect(result.code).toContain("import { test, expect } from '@playwright/test';")
    expect(result.code).toContain("test('User Login Flow', async ({ page }) => {")
    expect(result.code).toContain("await page.goto(\"https://example.com/login\", { waitUntil: 'domcontentloaded' });")
    expect(result.code).toContain("await page.locator(\"input#username\").fill(\"testuser\");")
    expect(result.code).toContain("await page.locator(\"button#submit\").click();")
  })

  it('safeguards masked secrets with process.env placeholders', () => {
    const events: MacroBrowserEvent[] = [
      {
        kind: 'navigate',
        url: 'https://example.com/login',
        timestamp: 1000,
      },
      {
        kind: 'type',
        selector: 'input[type="password"]',
        value: '[MASKED]',
        masked: true,
        target: 'password-input',
        timestamp: 2000,
      },
    ]

    const result = PlaywrightExporter.export(events, { useEnvSecrets: true })

    expect(result.secretsUsed.length).toBeGreaterThan(0)
    expect(result.secretsUsed[0]).toMatch(/^SECRET_/)
    expect(result.code).toContain(`const ${result.secretsUsed[0]} = process.env.${result.secretsUsed[0]} || '';`)
    expect(result.code).toContain(`.fill(${result.secretsUsed[0]});`)
    expect(result.code).not.toContain('[MASKED]')
  })

  it('generates scroll evaluations correctly', () => {
    const events: MacroBrowserEvent[] = [
      {
        kind: 'navigate',
        url: 'https://example.com/feed',
        timestamp: 1000,
      },
      {
        kind: 'scroll',
        scrollX: 0,
        scrollY: 850,
        timestamp: 2500,
      },
    ]

    const result = PlaywrightExporter.export(events)
    expect(result.stepsCount).toBe(2)
    expect(result.code).toContain('await page.evaluate(({ x, y }) => window.scrollTo(x, y), { x: 0, y: 850 });')
  })

  it('generates assertions when requested', () => {
    const events: MacroBrowserEvent[] = [
      {
        kind: 'navigate',
        url: 'https://dashboard.example.com/overview',
        timestamp: 1000,
      },
    ]

    const result = PlaywrightExporter.export(events, { generateAssertions: true })
    expect(result.code).toContain('await expect(page).toHaveURL(/dashboard\\.example\\.com/);')
  })
})
