import { describe, it, expect, vi } from 'vitest'
import { readFile } from 'fs/promises'
import { buildMemoryContext, recencyDecay, keywordOverlap } from './retrieval'
import type { MemoryEntry } from './store'

vi.mock('fs/promises', () => ({
  readFile: vi.fn(async () => '{"entries":[]}'),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined)
}))

const FIXED_NOW = new Date('2026-08-20T12:00:00.000Z')

describe('recencyDecay', () => {
  it('is 1.0 at zero age', () => {
    expect(recencyDecay(0)).toBe(1)
  })

  it('decreases monotonically with age', () => {
    expect(recencyDecay(30)).toBeLessThan(recencyDecay(1))
  })
})

describe('keywordOverlap', () => {
  it('is 0 for completely unrelated strings', () => {
    expect(keywordOverlap('working on acucall project', 'the weather is nice today')).toBe(0)
  })

  it('is higher for strings sharing more words', () => {
    const high = keywordOverlap('working on the acucall project', 'still working on acucall')
    const low = keywordOverlap('working on the acucall project', 'went for a walk')
    expect(high).toBeGreaterThan(low)
  })

  it('is 0 when either string is empty', () => {
    expect(keywordOverlap('', 'something')).toBe(0)
  })
})

function entry(overrides: Partial<MemoryEntry>): MemoryEntry {
  return {
    id: 'a1',
    category: 'fact',
    text: 'x',
    createdAt: FIXED_NOW.toISOString(),
    lastConfirmedAt: FIXED_NOW.toISOString(),
    confidence: 1,
    sourceCount: 1,
    ...overrides
  }
}

describe('buildMemoryContext', () => {
  it('returns null when there are no entries', async () => {
    vi.mocked(readFile).mockResolvedValueOnce('{"entries":[]}')
    expect(await buildMemoryContext(6, undefined, FIXED_NOW)).toBeNull()
  })

  it('includes entry text in the returned blurb', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({ entries: [entry({ text: 'Working on the Acucall project' })] }))
    const context = await buildMemoryContext(6, undefined, FIXED_NOW)
    expect(context).toContain('Working on the Acucall project')
  })

  it('ranks more recent/higher-weighted entries first', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(
      JSON.stringify({
        entries: [
          entry({ id: 'old', category: 'fact', text: 'old fact', lastConfirmedAt: '2026-06-01T00:00:00.000Z' }),
          entry({ id: 'new', category: 'project', text: 'active project', lastConfirmedAt: '2026-08-19T00:00:00.000Z' })
        ]
      })
    )
    const context = await buildMemoryContext(6, undefined, FIXED_NOW)
    expect(context!.indexOf('active project')).toBeLessThan(context!.indexOf('old fact'))
  })

  it('respects the limit', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(
      JSON.stringify({
        entries: [entry({ id: 'a', text: 'apple entry' }), entry({ id: 'b', text: 'banana entry' }), entry({ id: 'c', text: 'cherry entry' })]
      })
    )
    const context = await buildMemoryContext(1, undefined, FIXED_NOW)
    const mentioned = ['apple entry', 'banana entry', 'cherry entry'].filter((t) => context!.includes(t))
    expect(mentioned).toHaveLength(1)
  })
})
