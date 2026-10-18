/**
 * REWIND PowerShell DevOps Script Generator
 * Converts recorded command lines, directory transitions, and terminal actions into
 * clean, idempotent PowerShell (.ps1) automation scripts.
 */

import type { MacroExportResult } from '../types.js'

export interface PowerShellMacroStep {
  command?: string
  workingDirectory?: string
  description?: string
  environmentVariables?: Record<string, string>
}

export interface PowerShellExportOptions {
  scriptName?: string
  author?: string
  stopOnError?: boolean
  elevated?: boolean
}

export class PowerShellExporter {
  public static export(
    steps: PowerShellMacroStep[],
    options: PowerShellExportOptions = {}
  ): MacroExportResult {
    const scriptName = options.scriptName || 'REWIND Automated DevOps Flow'
    const stopOnError = options.stopOnError ?? true
    const lines: string[] = []

    lines.push(`<#`)
    lines.push(`.SYNOPSIS`)
    lines.push(`    ${scriptName}`)
    lines.push(`.DESCRIPTION`)
    lines.push(`    Auto-generated idempotent PowerShell automation macro exported by REWIND.`)
    lines.push(`    Timestamp: ${new Date().toISOString()}`)
    lines.push(`#>`)
    lines.push(`[CmdletBinding()]`)
    lines.push(`param()`)
    lines.push(``)

    if (stopOnError) {
      lines.push(`$ErrorActionPreference = 'Stop'`)
      lines.push(`$ProgressPreference = 'SilentlyContinue'`)
      lines.push(``)
    }

    if (options.elevated) {
      lines.push(`# Ensure script is running with administrative privileges`)
      lines.push(`$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)`)
      lines.push(`if (-not $isAdmin) {`)
      lines.push(`    Write-Error "This macro script requires administrative privileges. Please re-run in an elevated PowerShell session."`)
      lines.push(`    exit 1`)
      lines.push(`}`)
      lines.push(``)
    }

    lines.push(`Write-Host ">>> Starting REWIND Automation: ${scriptName.replace(/"/g, '`"')}" -ForegroundColor Cyan`)
    lines.push(``)

    let stepNum = 0
    let currentDir = ''
    const secretsUsed: string[] = []

    for (const step of steps) {
      stepNum++
      const desc = step.description ? `: ${step.description}` : ''
      lines.push(`# --- Step ${stepNum}${desc} ---`)
      lines.push(`Write-Host "[${stepNum}/${steps.length}] Executing step..." -ForegroundColor Green`)

      if (step.workingDirectory && step.workingDirectory !== currentDir) {
        lines.push(`if (Test-Path -LiteralPath ${JSON.stringify(step.workingDirectory)}) {`)
        lines.push(`    Set-Location -LiteralPath ${JSON.stringify(step.workingDirectory)}`)
        lines.push(`} else {`)
        lines.push(`    Write-Warning "Directory not found: ${step.workingDirectory.replace(/"/g, '`"')}"`)
        lines.push(`}`)
        currentDir = step.workingDirectory
      }

      if (step.environmentVariables) {
        for (const [key, val] of Object.entries(step.environmentVariables)) {
          if (/secret|token|password|key/i.test(key)) {
            const secretVar = `ENV_${key.toUpperCase().replace(/[^A-Z0-9_]/g, '_')}`
            secretsUsed.push(secretVar)
            lines.push(`$env:${key} = if ($env:${secretVar}) { $env:${secretVar} } else { Read-Host -Prompt "Enter value for ${key}" -AsSecureString }`)
          } else {
            lines.push(`$env:${key} = ${JSON.stringify(val)}`)
          }
        }
      }

      if (step.command) {
        lines.push(step.command.trim())
      }

      lines.push(``)
    }

    lines.push(`Write-Host ">>> REWIND Automation completed successfully." -ForegroundColor Cyan`)
    lines.push(``)

    return {
      code: lines.join('\n'),
      stepsCount: stepNum,
      secretsUsed,
      format: 'powershell',
    }
  }
}
