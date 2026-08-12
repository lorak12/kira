import { describe, it, expect, vi } from 'vitest'
import { runPowerShell } from './shell'
import { formatMemoryUsage, systemStatusTool } from './systemStatus'

vi.mock('./shell', () => ({ runPowerShell: vi.fn() }))
vi.mock('os', () => ({ cpus: vi.fn(() => new Array(8).fill({})), freemem: vi.fn(() => 4 * 1024 ** 3), totalmem: vi.fn(() => 16 * 1024 ** 3) }))

describe('formatMemoryUsage', () => {
  it('computes used percentage and total in GB', () => {
    const result = formatMemoryUsage(4 * 1024 ** 3, 16 * 1024 ** 3)
    expect(result).toBe('75% of 16 GB RAM in use')
  })
})

describe('systemStatusTool.execute', () => {
  it('includes CPU/RAM plus battery and disk when WMI succeeds', async () => {
    vi.mocked(runPowerShell).mockResolvedValueOnce(
      JSON.stringify({ batteryPercent: 82, charging: true, diskFreeGb: 120.5, diskTotalGb: 512 })
    )
    const result = await systemStatusTool.execute({})
    expect(result).toContain('8 CPU cores')
    expect(result).toContain('75% of 16 GB RAM in use')
    expect(result).toContain('battery at 82% and charging')
    expect(result).toContain('120.5 GB free of 512 GB on disk')
  })

  it('falls back to CPU/RAM only when WMI fails (e.g. desktop with no battery query support)', async () => {
    vi.mocked(runPowerShell).mockRejectedValueOnce(new Error('wmi unavailable'))
    const result = await systemStatusTool.execute({})
    expect(result).toContain('CPU cores')
    expect(result).not.toContain('battery')
  })

  it('omits battery when the machine has none', async () => {
    vi.mocked(runPowerShell).mockResolvedValueOnce(
      JSON.stringify({ batteryPercent: null, charging: null, diskFreeGb: 200, diskTotalGb: 500 })
    )
    const result = await systemStatusTool.execute({})
    expect(result).not.toContain('battery')
    expect(result).toContain('200 GB free')
  })
})
