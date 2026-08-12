import type { ToolDefinition } from './types'
import { runPowerShell } from './shell'

// Same P/Invoke pattern windowControl.ts uses -- GetForegroundWindow() is
// the one Win32 call that answers "what's the user actually looking at
// right now", which none of the existing process-listing tools (appOps.ts's
// list_running_apps) can answer since a running app isn't necessarily the
// focused one.
export const ACTIVE_WINDOW_SCRIPT = `
Add-Type -TypeDefinition '
using System;
using System.Runtime.InteropServices;
public class KiraFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}';
$h = [KiraFg]::GetForegroundWindow()
$p = Get-Process | Where-Object { $_.MainWindowHandle -eq $h } | Select-Object -First 1
if (-not $p) { Write-Output 'UNKNOWN' } else { Write-Output "$($p.ProcessName)|$($p.MainWindowTitle)" }
`

/** Parses the script's `ProcessName|Window Title` output into a spoken-friendly description. Pure/testable. */
export function describeActiveWindow(rawOutput: string): string {
  const trimmed = rawOutput.trim()
  if (!trimmed || trimmed === 'UNKNOWN') return "Couldn't tell what's currently focused."
  const [processName, ...titleParts] = trimmed.split('|')
  const title = titleParts.join('|').trim()
  if (!processName) return "Couldn't tell what's currently focused."
  return title && title !== processName ? `${processName} -- "${title}"` : processName
}

export const getActiveWindowTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'get_active_window',
    description:
      "Gets the name and window title of whatever app is currently focused/in the foreground on the user's screen -- use this when the user refers to \"this\" app/window/file without naming it.",
    parameters: { type: 'object', properties: {}, required: [] }
  },
  async execute() {
    try {
      const output = await runPowerShell(ACTIVE_WINDOW_SCRIPT)
      return describeActiveWindow(output)
    } catch (err) {
      return `Couldn't check the active window: ${(err as Error).message}`
    }
  }
}
