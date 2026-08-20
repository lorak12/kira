import { describe, it, expect, vi } from 'vitest'
import { readFile, writeFile, mkdir, rename } from 'fs/promises'
import { loadMemoryStore, saveMemoryStore, upsertEntry, pruneStale, memoryStorePath, type MemoryStore } from './store'

vi.mock('fs/promises', () => ({
  readFile: vi.fn(async () => '{"entries":[]}'),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined)
}))

const FIXED_NOW = new Date('2026-08-20T12:00:00.000Z')

describe('memoryStorePath', () => {
  it('lives under userData', () => {
    expect(memoryStorePath()).toContain('memory.json')
  })
})

describe('loadMemoryStore', () => {
  it('returns an empty store when the file does not exist', async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'))
    expect(await loadMemoryStore()).toEqual({ entries: [] })
  })

  it('parses a stored file', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({ entries: [{ id: 'a1', category: 'fact', text: 'x' }] }))
    const store = await loadMemoryStore()
    expect(store.entries).toHaveLength(1)
  })

  it('falls back to empty on corrupt JSON rather than throwing', async () => {
    vi.mocked(readFile).mockResolvedValueOnce('not json')
    expect(await loadMemoryStore()).toEqual({ entries: [] })
  })

  it('falls back to empty when entries is missing/malformed', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({ foo: 'bar' }))
    expect(await loadMemoryStore()).toEqual({ entries: [] })
  })
})

describe('saveMemoryStore', () => {
  it('writes to a tmp file then renames it into place', async () => {
    await saveMemoryStore({ entries: [] })
    expect(mkdir).toHaveBeenCalled()
    expect(writeFile).toHaveBeenCalledWith(expect.stringContaining('memory.json.tmp'), expect.any(String), 'utf-8')
    expect(rename).toHaveBeenCalledWith(expect.stringContaining('memory.json.tmp'), expect.stringContaining('memory.json'))
  })
})

describe('upsertEntry', () => {
  it('appends a new entry when no matchId is given', () => {
    const store: MemoryStore = { entries: [] }
    const updated = upsertEntry(store, { category: 'fact', text: 'likes tea', confidence: 1, sourceCount: 1 }, undefined, FIXED_NOW)
    expect(updated.entries).toHaveLength(1)
    expect(updated.entries[0]).toMatchObject({ category: 'fact', text: 'likes tea', createdAt: FIXED_NOW.toISOString() })
  })

  it('merges into an existing entry when matchId matches, bumping sourceCount and lastConfirmedAt', () => {
    const store: MemoryStore = {
      entries: [
        { id: 'a1', category: 'project', text: 'Working on Acucall', createdAt: '2026-08-01T00:00:00.000Z', lastConfirmedAt: '2026-08-01T00:00:00.000Z', confidence: 0.8, sourceCount: 1 }
      ]
    }
    const updated = upsertEntry(store, { category: 'project', text: 'Still working on Acucall', confidence: 0.9, sourceCount: 1 }, 'a1', FIXED_NOW)
    expect(updated.entries).toHaveLength(1)
    expect(updated.entries[0]).toMatchObject({ id: 'a1', text: 'Still working on Acucall', sourceCount: 2, lastConfirmedAt: FIXED_NOW.toISOString() })
  })

  it('appends fresh when matchId is given but does not match any existing entry', () => {
    const store: MemoryStore = { entries: [] }
    const updated = upsertEntry(store, { category: 'fact', text: 'x', confidence: 1, sourceCount: 1 }, 'does-not-exist', FIXED_NOW)
    expect(updated.entries).toHaveLength(1)
  })
})

describe('pruneStale', () => {
  const maxAgeDays = { project: 30, pattern: 60, preference: 180, fact: 365 }

  it('drops entries older than their category max age', () => {
    const store: MemoryStore = {
      entries: [
        { id: 'a1', category: 'project', text: 'old project', createdAt: '', lastConfirmedAt: '2026-07-01T00:00:00.000Z', confidence: 1, sourceCount: 1 },
        { id: 'a2', category: 'fact', text: 'old fact but still within a year', createdAt: '', lastConfirmedAt: '2026-07-01T00:00:00.000Z', confidence: 1, sourceCount: 1 }
      ]
    }
    const pruned = pruneStale(store, FIXED_NOW, maxAgeDays)
    expect(pruned.entries.map((e) => e.id)).toEqual(['a2'])
  })

  it('keeps entries within their category max age', () => {
    const store: MemoryStore = {
      entries: [{ id: 'a1', category: 'project', text: 'recent', createdAt: '', lastConfirmedAt: '2026-08-15T00:00:00.000Z', confidence: 1, sourceCount: 1 }]
    }
    expect(pruneStale(store, FIXED_NOW, maxAgeDays).entries).toHaveLength(1)
  })
})
