/**
 * REWIND AI PR Reviewer Provenance Contracts
 * Standardized data schemas capturing development provenance:
 * - Active Git branch and commits
 * - Local terminal test execution logs (npm test, cargo test, etc.)
 * - Visual browser/app before & after verification proof
 * - Document/issue reference context
 */

export interface PRProvenanceVerification {
  type: 'test_run' | 'browser_inspection' | 'linter_clean'
  timestamp: number
  command?: string
  exitCode?: number
  stdoutSnippet?: string
  targetUrl?: string
  visualProofHash?: string
}

export interface PRBranchProvenance {
  schemaVersion: '1.0.0'
  repository: string
  branchName: string
  timeRange: { start: number; end: number }
  metrics: {
    activeWorkMinutes: number
    contextSwitchRate: number
    testsExecuted: number
    testsPassing: number
  }
  verifications: PRProvenanceVerification[]
  visualDiffs: Array<{
    beforeSnapshotId: string
    afterSnapshotId: string
    description: string
  }>
}

export interface IProvenanceExporter {
  generateBranchProvenance(
    branch: string,
    repository: string,
    moments: Array<Record<string, unknown>>
  ): PRBranchProvenance
  exportMarkdownReport(provenance: PRBranchProvenance): string
  exportJsonArtifact(provenance: PRBranchProvenance): string
}
