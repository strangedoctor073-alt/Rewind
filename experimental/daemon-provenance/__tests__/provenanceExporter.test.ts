import { describe, it, expect } from 'vitest'
import { provenanceExporter } from '../provenanceExporter'

describe('ProvenanceExporter', () => {
  it('generates branch provenance metrics and extracts test executions', () => {
    const mockMoments = [
      {
        id: 'm1',
        timestamp: 1700000000000,
        app_name: 'Code.exe',
        window_title: 'auth.ts - REWIND',
      },
      {
        id: 'm2',
        timestamp: 1700000600000,
        app_name: 'WindowsTerminal.exe',
        window_title: 'vitest run auth.test.ts',
      },
      {
        id: 'm3',
        timestamp: 1700001200000,
        app_name: 'chrome.exe',
        window_title: 'localhost:5173 - REWIND',
      },
    ]

    const provenance = provenanceExporter.generateBranchProvenance(
      'feature/auth-guard',
      'strangedoctor073-alt/Rewind',
      mockMoments
    )

    expect(provenance.branchName).toBe('feature/auth-guard')
    expect(provenance.repository).toBe('strangedoctor073-alt/Rewind')
    expect(provenance.metrics.testsExecuted).toBe(1)
    expect(provenance.metrics.testsPassing).toBe(1)
    expect(provenance.verifications).toHaveLength(1)
    expect(provenance.verifications[0].type).toBe('test_run')
  })

  it('exports formatted Markdown report with verified execution trace', () => {
    const provenance = provenanceExporter.generateBranchProvenance(
      'feature/ui-flow',
      'Rewind',
      [
        {
          id: 'm1',
          timestamp: 1700000000000,
          app_name: 'powershell.exe',
          window_title: 'npm test',
        },
      ]
    )

    const markdown = provenanceExporter.exportMarkdownReport(provenance)
    expect(markdown).toContain('REWIND Development Provenance for `feature/ui-flow`')
    expect(markdown).toContain('1 / 1 passing (100%)')
    expect(markdown).toContain('npm test')
    expect(markdown).toContain('✅ Pass')
  })

  it('exports valid JSON artifact', () => {
    const provenance = provenanceExporter.generateBranchProvenance('main', 'Rewind', [])
    const jsonStr = provenanceExporter.exportJsonArtifact(provenance)
    const parsed = JSON.parse(jsonStr)

    expect(parsed.schemaVersion).toBe('1.0.0')
    expect(parsed.branchName).toBe('main')
  })
})
