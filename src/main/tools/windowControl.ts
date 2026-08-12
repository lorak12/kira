import type { ToolDefinition } from './types'
import { runPowerShell } from './shell'

export type WindowAction = 'focus' | 'minimize' | 'maximize' | 'restore' | 'close'

const SW_CODE: Record<WindowAction, number> = {
  focus: 9, // SW_RESTORE, followed by SetForegroundWindow
  minimize: 6, // SW_MINIMIZE
  maximize: 3, // SW_MAXIMIZE
  restore: 9, // SW_RESTORE
  close: -1 // handled separately via CloseMainWindow()
}

/** Builds the PowerShell script for a window action against the first process whose name/title matches. Pure/testable. */
export function buildWindowControlScript(appName: string, action: WindowAction): string {
  const escaped = appName.replace(/'/g, "''")
  const proc = `(Get-Process | Where-Object { $_.MainWindowTitle -ne '' -and ($_.ProcessName -like '*${escaped}*' -or $_.MainWindowTitle -like '*${escaped}*') } | Select-Object -First 1)`

  if (action === 'close') {
    return `
$p = ${proc}
if (-not $p) { Write-Output 'NOT_FOUND'; exit }
$p.CloseMainWindow() | Out-Null
Write-Output "CLOSED:$($p.ProcessName)"
`
  }

  const sw = SW_CODE[action]
  const focusCall = action === 'focus' ? '[KiraWin]::SetForegroundWindow($p.MainWindowHandle) | Out-Null' : ''
  return `
Add-Type -TypeDefinition '
using System;
using System.Runtime.InteropServices;
public class KiraWin {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}';
$p = ${proc}
if (-not $p) { Write-Output 'NOT_FOUND'; exit }
[KiraWin]::ShowWindow($p.MainWindowHandle, ${sw}) | Out-Null
${focusCall}
Write-Output "OK:$($p.ProcessName)"
`
}

export const windowControlTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'window_control',
    description:
      "Controls an open application's window by name -- bring it to focus, minimize, maximize, restore, or close it.",
    parameters: {
      type: 'object',
      properties: {
        appName: { type: 'string', description: 'The name of the app/window, e.g. "Discord" or "Chrome"' },
        action: {
          type: 'string',
          description: 'The window action to perform',
          enum: ['focus', 'minimize', 'maximize', 'restore', 'close']
        }
      },
      required: ['appName', 'action']
    }
  },
  async execute(args) {
    const appName = String(args.appName ?? '')
    const action = String(args.action ?? '') as WindowAction
    if (!(action in SW_CODE)) return `Unknown window action "${action}".`
    try {
      const output = await runPowerShell(buildWindowControlScript(appName, action))
      if (output.includes('NOT_FOUND')) return `No open window found matching "${appName}".`
      return `${action === 'close' ? 'Closed' : action === 'focus' ? 'Focused' : `Set window state (${action}) on`} ${appName}.`
    } catch (err) {
      return `Couldn't control the window: ${(err as Error).message}`
    }
  }
}
