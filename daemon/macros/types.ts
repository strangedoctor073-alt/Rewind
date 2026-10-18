/**
 * REWIND Macro & Workflow Automation Types
 */

export interface MacroBrowserEvent {
  id?: string
  timestamp?: number
  kind: 'click' | 'type' | 'scroll' | 'navigate'
  url?: string
  selector?: string
  value?: string
  masked?: boolean
  label?: string
  scrollX?: number
  scrollY?: number
  target?: string
}

export interface PlaywrightExportOptions {
  testName?: string
  useEnvSecrets?: boolean
  defaultTimeoutMs?: number
  generateAssertions?: boolean
}

export interface MacroExportResult {
  code: string
  stepsCount: number
  secretsUsed: string[]
  format: 'playwright' | 'powershell'
}
