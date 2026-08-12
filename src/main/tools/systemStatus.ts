import { cpus, freemem, totalmem } from 'os'
import type { ToolDefinition } from './types'
import { runPowerShell } from './shell'

/** CPU/RAM figures from Node's os module, formatted for speech. Pure/testable. */
export function formatMemoryUsage(freeBytes: number, totalBytes: number): string {
  const usedPercent = Math.round(((totalBytes - freeBytes) / totalBytes) * 100)
  const totalGb = Math.round((totalBytes / 1024 ** 3) * 10) / 10
  return `${usedPercent}% of ${totalGb} GB RAM in use`
}

const BATTERY_DISK_SCRIPT = `
$battery = Get-WmiObject Win32_Battery | Select-Object -First 1
$disk = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Name -eq (Get-Location).Drive.Name }
[PSCustomObject]@{
  batteryPercent = if ($battery) { $battery.EstimatedChargeRemaining } else { $null }
  charging = if ($battery) { $battery.BatteryStatus -eq 2 } else { $null }
  diskFreeGb = if ($disk) { [math]::Round($disk.Free / 1GB, 1) } else { $null }
  diskTotalGb = if ($disk) { [math]::Round(($disk.Free + $disk.Used) / 1GB, 1) } else { $null }
} | ConvertTo-Json -Compress
`

export interface BatteryDiskInfo {
  batteryPercent: number | null
  charging: boolean | null
  diskFreeGb: number | null
  diskTotalGb: number | null
}

// Shared with tools/systemWatch.ts, which polls this same reading rather
// than duplicating the WMI script -- one source of truth for how
// battery/disk numbers are obtained.
export async function getBatteryDiskInfo(): Promise<BatteryDiskInfo> {
  const raw = await runPowerShell(BATTERY_DISK_SCRIPT)
  return JSON.parse(raw) as BatteryDiskInfo
}

export const systemStatusTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'get_system_status',
    description:
      "Reports the computer's current status right now: CPU core count, RAM usage, battery level (if a laptop), and free disk space. For \"let me know when X happens\" instead of a one-time check, use watch_system_metric.",
    parameters: { type: 'object', properties: {}, required: [] }
  },
  async execute() {
    const parts = [formatMemoryUsage(freemem(), totalmem()), `${cpus().length} CPU cores`]
    try {
      const info = await getBatteryDiskInfo()
      if (info.batteryPercent !== null) {
        parts.push(`battery at ${info.batteryPercent}%${info.charging ? ' and charging' : ''}`)
      }
      if (info.diskFreeGb !== null) {
        parts.push(`${info.diskFreeGb} GB free of ${info.diskTotalGb} GB on disk`)
      }
    } catch {
      // Battery/disk info is best-effort -- still report CPU/RAM if WMI fails.
    }
    return parts.join(', ') + '.'
  }
}
