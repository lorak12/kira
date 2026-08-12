import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getBatteryDiskInfo } from './systemStatus'
import {
  hasCrossed,
  initSystemWatch,
  resetWatches,
  watchSystemMetricTool,
  listWatchesTool,
  cancelWatchTool
} from './systemWatch'

vi.mock('./systemStatus', () => ({
  getBatteryDiskInfo: vi.fn(async () => ({ batteryPercent: 50, charging: false, diskFreeGb: 100, diskTotalGb: 500 }))
}))

beforeEach(() => {
  resetWatches()
  vi.mocked(getBatteryDiskInfo).mockReset()
  vi.mocked(getBatteryDiskInfo).mockResolvedValue({ batteryPercent: 50, charging: false, diskFreeGb: 100, diskTotalGb: 500 })
})

describe('hasCrossed', () => {
  it('detects a value below a "below" threshold', () => {
    expect(hasCrossed(15, 'below', 20)).toBe(true)
    expect(hasCrossed(25, 'below', 20)).toBe(false)
  })

  it('detects a value above an "above" threshold', () => {
    expect(hasCrossed(25, 'above', 20)).toBe(true)
    expect(hasCrossed(15, 'above', 20)).toBe(false)
  })
})

describe('watchSystemMetricTool.execute', () => {
  it('rejects an unknown metric', async () => {
    const result = await watchSystemMetricTool.execute({ metric: 'cpu_percent', comparison: 'below', threshold: 50 })
    expect(result).toContain('Unknown metric')
  })

  it('rejects an unknown comparison', async () => {
    const result = await watchSystemMetricTool.execute({ metric: 'battery_percent', comparison: 'sideways', threshold: 50 })
    expect(result).toContain('Unknown comparison')
  })

  it('rejects a non-numeric threshold', async () => {
    const result = await watchSystemMetricTool.execute({ metric: 'battery_percent', comparison: 'below', threshold: 'low' })
    expect(result).toContain('not a valid number')
  })

  it('confirms a watch was registered', async () => {
    const result = await watchSystemMetricTool.execute({ metric: 'battery_percent', comparison: 'below', threshold: 20 })
    expect(result).toContain('battery')
    expect(result).toContain('below 20%')
    expect(await listWatchesTool.execute({})).toContain('battery below 20%')
  })

  it('fires the trigger hook once the metric crosses the threshold on a later poll', async () => {
    vi.useFakeTimers()
    const onTrigger = vi.fn()
    initSystemWatch(onTrigger)
    await watchSystemMetricTool.execute({ metric: 'battery_percent', comparison: 'below', threshold: 20 })
    // Immediate check (battery is 50, threshold 20) shouldn't fire yet.
    await vi.advanceTimersByTimeAsync(0)
    expect(onTrigger).not.toHaveBeenCalled()

    vi.mocked(getBatteryDiskInfo).mockResolvedValue({ batteryPercent: 15, charging: false, diskFreeGb: 100, diskTotalGb: 500 })
    await vi.advanceTimersByTimeAsync(60_000)

    expect(onTrigger).toHaveBeenCalledWith(expect.stringContaining('battery'), expect.any(Number))
    expect(await listWatchesTool.execute({})).toBe('No active watches.')
    vi.useRealTimers()
  })

  it('fires immediately if the metric is already past the threshold when set', async () => {
    vi.useFakeTimers()
    const onTrigger = vi.fn()
    initSystemWatch(onTrigger)
    vi.mocked(getBatteryDiskInfo).mockResolvedValue({ batteryPercent: 5, charging: false, diskFreeGb: 100, diskTotalGb: 500 })
    await watchSystemMetricTool.execute({ metric: 'battery_percent', comparison: 'below', threshold: 20 })
    await vi.advanceTimersByTimeAsync(0)
    expect(onTrigger).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('stops polling after it fires -- one-shot, not continuous', async () => {
    vi.useFakeTimers()
    initSystemWatch(vi.fn())
    vi.mocked(getBatteryDiskInfo).mockResolvedValue({ batteryPercent: 5, charging: false, diskFreeGb: 100, diskTotalGb: 500 })
    await watchSystemMetricTool.execute({ metric: 'battery_percent', comparison: 'below', threshold: 20 })
    await vi.advanceTimersByTimeAsync(0)
    const callsAfterFire = vi.mocked(getBatteryDiskInfo).mock.calls.length
    await vi.advanceTimersByTimeAsync(120_000)
    expect(vi.mocked(getBatteryDiskInfo).mock.calls.length).toBe(callsAfterFire)
    vi.useRealTimers()
  })
})

describe('listWatchesTool.execute', () => {
  it('reports no active watches initially', async () => {
    expect(await listWatchesTool.execute({})).toBe('No active watches.')
  })
})

describe('cancelWatchTool.execute', () => {
  it('cancels a specific watch by id', async () => {
    await watchSystemMetricTool.execute({ metric: 'disk_free_gb', comparison: 'below', threshold: 10 })
    const result = await cancelWatchTool.execute({ id: 1 })
    expect(result).toBe('Cancelled watch #1.')
    expect(await listWatchesTool.execute({})).toBe('No active watches.')
  })

  it('reports when the id does not exist', async () => {
    const result = await cancelWatchTool.execute({ id: 999 })
    expect(result).toContain('No watch with id 999')
  })

  it('cancels all watches when no id is given', async () => {
    await watchSystemMetricTool.execute({ metric: 'battery_percent', comparison: 'below', threshold: 20 })
    await watchSystemMetricTool.execute({ metric: 'disk_free_gb', comparison: 'below', threshold: 10 })
    const result = await cancelWatchTool.execute({})
    expect(result).toBe('Cancelled 2 watch(es).')
  })
})
