import { describe, it, expect } from 'vitest'
import { formatNow, addDuration, DatetimeError, datetimeTool } from './datetime'

const FIXED_NOW = new Date('2026-08-11T12:00:00Z')

describe('formatNow', () => {
  it('formats a fixed instant in a given timezone', () => {
    const result = formatNow('America/New_York', FIXED_NOW)
    expect(result).toContain('2026')
    expect(result).toContain('8:00')
  })

  it('throws DatetimeError on an unknown timezone', () => {
    expect(() => formatNow('Not/A_Timezone', FIXED_NOW)).toThrow(DatetimeError)
  })
})

describe('addDuration', () => {
  it('adds days', () => {
    const result = addDuration(3, 'days', FIXED_NOW)
    expect(result.toISOString()).toBe('2026-08-14T12:00:00.000Z')
  })

  it('subtracts minutes for negative amounts ("ago")', () => {
    const result = addDuration(-90, 'minutes', FIXED_NOW)
    expect(result.toISOString()).toBe('2026-08-11T10:30:00.000Z')
  })

  it('throws DatetimeError on an unknown unit', () => {
    expect(() => addDuration(1, 'fortnights', FIXED_NOW)).toThrow(DatetimeError)
  })
})

describe('datetimeTool.execute', () => {
  it('returns the current time when no offset is given', async () => {
    const result = await datetimeTool.execute({})
    expect(result.length).toBeGreaterThan(0)
  })

  it('returns a friendly error for a bad timezone instead of throwing', async () => {
    const result = await datetimeTool.execute({ timezone: 'Mars/Olympus_Mons' })
    expect(result).toContain('Could not get the date/time')
  })

  it('applies date math when amount/unit are given', async () => {
    const result = await datetimeTool.execute({ amount: 1, unit: 'days' })
    expect(result.length).toBeGreaterThan(0)
  })
})
