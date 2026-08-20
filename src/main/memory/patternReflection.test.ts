import { describe, it, expect, vi } from 'vitest'
import { readFile, writeFile } from 'fs/promises'
import { groupUsageEvents, runPatternReflection } from './patternReflection'
import type { UsageEvent } from './usageStats'
import type { LlmEngine, LlmResponse } from '../llm/LlmEngine'

vi.mock('fs/promises', () => ({
  readFile: vi.fn(async () => ''),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined)
}))

function fakeEngine(responseText: string): LlmEngine {
  const response: LlmResponse = { type: 'text', content: responseText }
  return { chat: vi.fn(async () => response) }
}

/** A weekday 8am timestamp on the given date, e.g. '2026-08-10' (a Monday). */
function weekdayMorning(dateStr: string): string {
  return `${dateStr}T08:00:00.000Z`
}

describe('groupUsageEvents', () => {
  it('groups by category + weekday/weekend + 2-hour bucket, filtering below the occurrence threshold', () => {
    const events: UsageEvent[] = [
      { ts: weekdayMorning('2026-08-10'), toolName: 'get_directions', category: 'commute' },
      { ts: weekdayMorning('2026-08-11'), toolName: 'get_directions', category: 'commute' },
      { ts: weekdayMorning('2026-08-12'), toolName: 'get_directions', category: 'commute' },
      // Only one occurrence -- below MIN_OCCURRENCES, should be filtered out.
      { ts: '2026-08-15T20:00:00.000Z', toolName: 'open_app', category: 'app-launch' }
    ]
    const candidates = groupUsageEvents(events)
    expect(candidates).toHaveLength(1)
    expect(candidates[0]).toMatchObject({ category: 'commute', dayBucket: 'weekday', count: 3 })
  })

  it('separates weekday from weekend occurrences of the same category/hour', () => {
    const events: UsageEvent[] = [
      { ts: weekdayMorning('2026-08-10'), toolName: 'get_directions', category: 'commute' }, // Monday
      { ts: weekdayMorning('2026-08-11'), toolName: 'get_directions', category: 'commute' }, // Tuesday
      { ts: weekdayMorning('2026-08-15'), toolName: 'get_directions', category: 'commute' }, // Saturday
      { ts: weekdayMorning('2026-08-16'), toolName: 'get_directions', category: 'commute' } // Sunday
    ]
    const candidates = groupUsageEvents(events)
    expect(candidates.every((c) => c.count < 3)).toBe(true)
  })

  it('returns an empty array for no events', () => {
    expect(groupUsageEvents([])).toEqual([])
  })
})

describe('runPatternReflection', () => {
  it('does nothing when there are no usage events', async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'))
    const engine = fakeEngine(JSON.stringify({ patterns: [] }))
    await runPatternReflection(engine)
    expect(engine.chat).not.toHaveBeenCalled()
  })

  it('persists phrased patterns from the LLM response', async () => {
    const events: UsageEvent[] = [
      { ts: weekdayMorning('2026-08-10'), toolName: 'get_directions', category: 'commute' },
      { ts: weekdayMorning('2026-08-11'), toolName: 'get_directions', category: 'commute' },
      { ts: weekdayMorning('2026-08-12'), toolName: 'get_directions', category: 'commute' }
    ]
    vi.mocked(readFile)
      .mockResolvedValueOnce(events.map((e) => JSON.stringify(e)).join('\n')) // usage-stats.jsonl
      .mockResolvedValueOnce('{"entries":[]}') // memory.json

    const engine = fakeEngine(JSON.stringify({ patterns: [{ text: 'Usually checks directions weekday mornings.' }] }))
    await runPatternReflection(engine)

    expect(writeFile).toHaveBeenCalled()
    const written = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string)
    expect(written.entries[0]).toMatchObject({ category: 'pattern', text: 'Usually checks directions weekday mornings.' })
  })

  it('never throws, even if the LLM call fails', async () => {
    const events: UsageEvent[] = [
      { ts: weekdayMorning('2026-08-10'), toolName: 'get_directions', category: 'commute' },
      { ts: weekdayMorning('2026-08-11'), toolName: 'get_directions', category: 'commute' },
      { ts: weekdayMorning('2026-08-12'), toolName: 'get_directions', category: 'commute' }
    ]
    vi.mocked(readFile).mockResolvedValueOnce(events.map((e) => JSON.stringify(e)).join('\n')).mockResolvedValueOnce('{"entries":[]}')
    const engine: LlmEngine = { chat: vi.fn(async () => { throw new Error('down') }) }
    await expect(runPatternReflection(engine)).resolves.toBeUndefined()
  })
})
