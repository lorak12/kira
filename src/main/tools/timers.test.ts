import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Notification } from 'electron'
import { readFile, writeFile } from 'fs/promises'
import { setTimerTool, listTimersTool, cancelTimerTool, resetTimers, restoreTimers, formatRemaining } from './timers'

vi.mock('fs/promises', () => ({
  mkdir: vi.fn(async () => undefined),
  readFile: vi.fn(async () => {
    throw new Error('ENOENT')
  }),
  writeFile: vi.fn(async () => undefined)
}))

beforeEach(() => {
  resetTimers()
  vi.mocked(readFile).mockReset()
  vi.mocked(readFile).mockRejectedValue(new Error('ENOENT'))
  vi.mocked(writeFile).mockClear()
})

describe('formatRemaining', () => {
  it('formats sub-minute durations in seconds', () => {
    expect(formatRemaining(Date.now() + 45_000, Date.now())).toBe('45s')
  })

  it('formats multi-minute durations as "Xm Ys"', () => {
    const now = Date.now()
    expect(formatRemaining(now + 125_000, now)).toBe('2m 5s')
  })

  it('drops the seconds part when exactly on a minute boundary', () => {
    const now = Date.now()
    expect(formatRemaining(now + 120_000, now)).toBe('2m')
  })
})

describe('setTimerTool.execute', () => {
  it('rejects non-positive durations', async () => {
    const result = await setTimerTool.execute({ seconds: 0 })
    expect(result).toContain('positive duration')
  })

  it('confirms a timer was set, including the label', async () => {
    const result = await setTimerTool.execute({ seconds: 60, label: 'pasta' })
    expect(result).toContain('pasta')
    expect(result).toContain('1m')
  })

  it('fires a notification when the duration elapses', async () => {
    vi.useFakeTimers()
    await setTimerTool.execute({ seconds: 10, label: 'tea' })
    vi.advanceTimersByTime(10_000)
    expect(Notification.instances).toContainEqual(expect.objectContaining({ body: expect.stringContaining('tea') }))
    vi.useRealTimers()
  })

  it('persists to disk on set', async () => {
    await setTimerTool.execute({ seconds: 30, label: 'eggs' })
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining('timers.json'),
      expect.stringContaining('eggs'),
      'utf-8'
    )
  })
})

describe('setTimerTool.execute with atIso (absolute reminders)', () => {
  it('accepts a valid future ISO date-time instead of seconds', async () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    const result = await setTimerTool.execute({ atIso: future, label: 'standup' })
    expect(result).toContain('standup')
  })

  it('rejects a date-time it cannot parse', async () => {
    const result = await setTimerTool.execute({ atIso: 'not a date' })
    expect(result).toContain("isn't a date/time I can understand")
  })

  it('rejects a date-time already in the past', async () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    const result = await setTimerTool.execute({ atIso: past })
    expect(result).toContain('already passed')
  })

  it('refuses a reminder scheduled unreliably far in the future', async () => {
    const farFuture = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const result = await setTimerTool.execute({ atIso: farFuture })
    expect(result).toContain('too far out')
  })
})

describe('a fired timer', () => {
  it('calls the onFire hook registered via restoreTimers, not just the OS notification', async () => {
    vi.useFakeTimers()
    const onFire = vi.fn()
    await restoreTimers(onFire)
    await setTimerTool.execute({ seconds: 5, label: 'oven' })
    vi.advanceTimersByTime(5_000)
    expect(onFire).toHaveBeenCalledWith(expect.stringContaining('oven'), expect.any(Number))
    vi.useRealTimers()
  })
})

describe('restoreTimers', () => {
  it('does nothing when there is no saved file', async () => {
    const onFire = vi.fn()
    await restoreTimers(onFire)
    expect(await listTimersTool.execute({})).toBe('No active timers.')
    expect(onFire).not.toHaveBeenCalled()
  })

  it('reschedules a still-future saved timer instead of firing it immediately', async () => {
    vi.useFakeTimers()
    const now = Date.now()
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify([{ id: 1, label: 'bread', fireAt: now + 60_000 }]))
    const onFire = vi.fn()
    await restoreTimers(onFire)
    expect(onFire).not.toHaveBeenCalled()
    expect(await listTimersTool.execute({})).toContain('bread')
    vi.useRealTimers()
  })

  it('fires immediately, as a "missed" catch-up, for a saved timer whose time already passed', async () => {
    const now = Date.now()
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify([{ id: 1, label: 'bread', fireAt: now - 5_000 }]))
    const onFire = vi.fn()
    await restoreTimers(onFire)
    expect(onFire).toHaveBeenCalledWith(expect.stringContaining('bread'), 1)
    expect(onFire).toHaveBeenCalledWith(expect.stringContaining('missed'), 1)
  })

  it('continues assigning fresh ids above the highest restored one', async () => {
    const now = Date.now()
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify([{ id: 7, label: 'old', fireAt: now + 60_000 }]))
    await restoreTimers(vi.fn())
    const result = await setTimerTool.execute({ seconds: 10, label: 'new' })
    expect(await listTimersTool.execute({})).toContain('#8')
    expect(result).toContain('10s')
  })
})

describe('listTimersTool.execute', () => {
  it('reports no active timers initially', async () => {
    const result = await listTimersTool.execute({})
    expect(result).toBe('No active timers.')
  })

  it('lists active timers with remaining time', async () => {
    await setTimerTool.execute({ seconds: 30, label: 'eggs' })
    const result = await listTimersTool.execute({})
    expect(result).toContain('eggs')
    expect(result).toContain('30s left')
  })
})

describe('cancelTimerTool.execute', () => {
  it('cancels a specific timer by id', async () => {
    await setTimerTool.execute({ seconds: 30, label: 'eggs' })
    const result = await cancelTimerTool.execute({ id: 1 })
    expect(result).toContain('eggs')
    expect(await listTimersTool.execute({})).toBe('No active timers.')
  })

  it('reports when the id does not exist', async () => {
    const result = await cancelTimerTool.execute({ id: 999 })
    expect(result).toContain('No timer with id 999')
  })

  it('cancels all timers when no id is given', async () => {
    await setTimerTool.execute({ seconds: 30 })
    await setTimerTool.execute({ seconds: 60 })
    const result = await cancelTimerTool.execute({})
    expect(result).toBe('Cancelled 2 timer(s).')
  })
})
