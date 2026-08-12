import type { ToolDefinition } from './types'
import { runPowerShell } from './shell'
import { clampPercent } from './volume'

// Works for internal laptop panels and monitors that expose DDC/CI brightness
// via WMI; external desktop monitors often don't support this at all, which
// surfaces as a WMI error we turn into a friendly message.
function buildSetBrightnessScript(level: number): string {
  return `
try {
  $m = Get-WmiObject -Namespace root/wmi -Class WmiMonitorBrightnessMethods -ErrorAction Stop
  $m.WmiSetBrightness(1, ${level})
  Write-Output 'OK'
} catch {
  Write-Output "ERROR:$($_.Exception.Message)"
}
`
}

export const setBrightnessTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'set_brightness',
    description: "Sets the screen brightness to an absolute percentage (0-100). Only works on displays that support software brightness control (most laptop panels; not all external monitors).",
    parameters: {
      type: 'object',
      properties: {
        level: { type: 'number', description: 'Target brightness, 0-100' }
      },
      required: ['level']
    }
  },
  async execute(args) {
    const level = clampPercent(Number(args.level))
    try {
      const output = await runPowerShell(buildSetBrightnessScript(level))
      if (output.startsWith('ERROR')) {
        return "This display doesn't support software brightness control."
      }
      return `Brightness set to ${level}%.`
    } catch (err) {
      return `Couldn't set brightness: ${(err as Error).message}`
    }
  }
}
