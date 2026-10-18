import { describe, it, expect } from 'vitest'
import { PowerShellExporter } from '../devops/powershellExporter.js'

describe('PowerShellExporter', () => {
  it('generates a clean, valid PowerShell automation script', () => {
    const steps = [
      {
        workingDirectory: 'C:\\Projects\\MyApp',
        command: 'git pull origin main',
        description: 'Update repository',
      },
      {
        command: 'npm install',
        description: 'Install dependencies',
      },
      {
        command: 'npm test',
        description: 'Execute test suite',
      },
    ]

    const result = PowerShellExporter.export(steps, { scriptName: 'Deploy App Flow' })

    expect(result.format).toBe('powershell')
    expect(result.stepsCount).toBe(3)
    expect(result.code).toContain("$ErrorActionPreference = 'Stop'")
    expect(result.code).toContain('Set-Location -LiteralPath "C:\\\\Projects\\\\MyApp"')
    expect(result.code).toContain('git pull origin main')
    expect(result.code).toContain('npm install')
    expect(result.code).toContain('npm test')
  })

  it('parameterizes sensitive environment variables', () => {
    const steps = [
      {
        command: 'terraform apply -auto-approve',
        environmentVariables: {
          TF_VAR_api_token: 'secret-val',
        },
      },
    ]

    const result = PowerShellExporter.export(steps)
    expect(result.secretsUsed).toContain('ENV_TF_VAR_API_TOKEN')
    expect(result.code).toContain('$env:ENV_TF_VAR_API_TOKEN')
  })

  it('adds elevation check when requested', () => {
    const steps = [{ command: 'Restart-Service spooler' }]
    const result = PowerShellExporter.export(steps, { elevated: true })
    expect(result.code).toContain('IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)')
  })
})
