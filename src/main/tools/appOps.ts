import type { ToolDefinition } from './types'
import { runPowerShell } from './shell'

const LIST_SCRIPT = `
Get-Process | Where-Object { $_.MainWindowTitle -ne '' } |
  Select-Object -ExpandProperty ProcessName -Unique
`

export const listRunningAppsTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'list_running_apps',
    description: 'Lists applications currently open with a visible window.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  async execute() {
    try {
      const output = await runPowerShell(LIST_SCRIPT)
      const names = output.split(/\r?\n/).map((n) => n.trim()).filter(Boolean)
      if (!names.length) return 'No applications with a visible window are currently open.'
      return `Open apps: ${names.join(', ')}.`
    } catch (err) {
      return `Couldn't list open apps: ${(err as Error).message}`
    }
  }
}

function buildCloseAppScript(appName: string): string {
  const escaped = appName.replace(/'/g, "''")
  return `
$procs = Get-Process | Where-Object { $_.ProcessName -like '*${escaped}*' -or $_.MainWindowTitle -like '*${escaped}*' }
if (-not $procs) { Write-Output 'NOT_FOUND'; exit }
$procs | Stop-Process -Force
Write-Output "CLOSED:$($procs.Count)"
`
}

export const closeAppTool: ToolDefinition = {
  // Force-closes the process (Stop-Process, not a graceful WM_CLOSE), which
  // can lose unsaved work -- always confirm before running this.
  risky: true,
  schema: {
    name: 'close_app',
    description: 'Force-closes a running application by name. This can lose unsaved work, so confirm with the user first.',
    parameters: {
      type: 'object',
      properties: {
        appName: { type: 'string', description: 'Name of the application/process to close' }
      },
      required: ['appName']
    }
  },
  async execute(args) {
    const appName = String(args.appName ?? '')
    if (!appName.trim()) return 'Please tell me which app to close.'
    try {
      const output = await runPowerShell(buildCloseAppScript(appName))
      if (output.includes('NOT_FOUND')) return `No running app found matching "${appName}".`
      return `Closed ${appName}.`
    } catch (err) {
      return `Couldn't close ${appName}: ${(err as Error).message}`
    }
  }
}
