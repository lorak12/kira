import { describe, it, expect, vi } from 'vitest'
import { appendFile, readFile, writeFile } from 'fs/promises'
import { appendUsageEvent, readUsageEvents, pruneUsageLog, categoryForTool, usageStatsPath } from './usageStats'

vi.mock('fs/promises', () => ({
  appendFile: vi.fn(async () => undefined),
  readFile: vi.fn(async () => ''),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined)
}))

describe('usageStatsPath', () => {
  it('lives under userData', () => {
    expect(usageStatsPath()).toContain('usage-stats.jsonl')
  })
})

describe('categoryForTool', () => {
  it('maps a known tool to its category', () => {
    expect(categoryForTool('get_directions')).toBe('commute')
    expect(categoryForTool('send_email')).toBe('email')
  })

  it('falls back to "other" for an unknown tool', () => {
    expect(categoryForTool('some_future_tool')).toBe('other')
  })
})

describe('appendUsageEvent', () => {
  it('appends one JSON line', async () => {
    await appendUsageEvent({ ts: '2026-08-20T00:00:00.000Z', toolName: 'get_directions', category: 'commute' })
    expect(appendFile).toHaveBeenCalledWith(
      expect.stringContaining('usage-stats.jsonl'),
      expect.stringContaining('"toolName":"get_directions"'),
      'utf-8'
    )
  })
})

describe('readUsageEvents', () => {
  it('returns an empty array when the file does not exist', async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'))
    expect(await readUsageEvents()).toEqual([])
  })

  it('parses valid JSONL lines', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(
      [
        JSON.stringify({ ts: '2026-08-19T00:00:00.000Z', toolName: 'a', category: 'x' }),
        JSON.stringify({ ts: '2026-08-20T00:00:00.000Z', toolName: 'b', category: 'y' })
      ].join('\n')
    )
    const events = await readUsageEvents()
    expect(events).toHaveLength(2)
  })

  it('skips a corrupt trailing line without losing prior lines', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(
      [JSON.stringify({ ts: '2026-08-20T00:00:00.000Z', toolName: 'a', category: 'x' }), '{not valid json'].join('\n')
    )
    const events = await readUsageEvents()
    expect(events).toHaveLength(1)
  })

  it('filters to events within sinceDays', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(
      [
        JSON.stringify({ ts: '2020-01-01T00:00:00.000Z', toolName: 'old', category: 'x' }),
        JSON.stringify({ ts: new Date().toISOString(), toolName: 'recent', category: 'y' })
      ].join('\n')
    )
    const events = await readUsageEvents(7)
    expect(events).toHaveLength(1)
    expect(events[0].toolName).toBe('recent')
  })
})

describe('pruneUsageLog', () => {
  it('rewrites the file keeping only events within maxAgeDays', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(
      [
        JSON.stringify({ ts: '2020-01-01T00:00:00.000Z', toolName: 'old', category: 'x' }),
        JSON.stringify({ ts: new Date().toISOString(), toolName: 'recent', category: 'y' })
      ].join('\n')
    )
    await pruneUsageLog(90)
    const written = vi.mocked(writeFile).mock.calls[0][1] as string
    expect(written).toContain('recent')
    expect(written).not.toContain('old')
  })
})
