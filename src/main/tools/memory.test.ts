import { describe, it, expect, vi } from 'vitest'
import { readFile, writeFile } from 'fs/promises'
import { rememberFactTool } from './memory'

vi.mock('fs/promises', () => ({
  readFile: vi.fn(async () => '{"entries":[]}'),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined)
}))

describe('remember_fact tool', () => {
  it('is not risky', () => {
    expect(rememberFactTool.risky).toBe(false)
  })

  it('rejects empty text without touching the filesystem', async () => {
    const result = await rememberFactTool.execute({ category: 'fact', text: '   ' })
    expect(result).toContain("nothing to remember")
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('saves a new entry and confirms', async () => {
    vi.mocked(readFile).mockResolvedValueOnce('{"entries":[]}')
    const result = await rememberFactTool.execute({ category: 'project', text: 'Working on the Acucall project' })
    expect(result).toBe("Got it, I'll remember that.")
    expect(writeFile).toHaveBeenCalled()
    const written = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string)
    expect(written.entries).toHaveLength(1)
    expect(written.entries[0].text).toBe('Working on the Acucall project')
  })

  it('defaults to the "fact" category for an unrecognized category value', async () => {
    vi.mocked(readFile).mockResolvedValueOnce('{"entries":[]}')
    await rememberFactTool.execute({ category: 'nonsense', text: 'something durable' })
    const written = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string)
    expect(written.entries[0].category).toBe('fact')
  })

  it('merges into an existing similar same-category entry instead of duplicating', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(
      JSON.stringify({
        entries: [
          {
            id: 'a1',
            category: 'project',
            text: 'Working on the Acucall project',
            createdAt: '2026-08-01T00:00:00.000Z',
            lastConfirmedAt: '2026-08-01T00:00:00.000Z',
            confidence: 1,
            sourceCount: 1
          }
        ]
      })
    )
    await rememberFactTool.execute({ category: 'project', text: 'Still working on the Acucall project' })
    const written = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string)
    expect(written.entries).toHaveLength(1)
    expect(written.entries[0].id).toBe('a1')
    expect(written.entries[0].sourceCount).toBe(2)
  })

  it('does not merge across different categories even with overlapping text', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(
      JSON.stringify({
        entries: [
          {
            id: 'a1',
            category: 'preference',
            text: 'Working on the Acucall project',
            createdAt: '2026-08-01T00:00:00.000Z',
            lastConfirmedAt: '2026-08-01T00:00:00.000Z',
            confidence: 1,
            sourceCount: 1
          }
        ]
      })
    )
    await rememberFactTool.execute({ category: 'project', text: 'Working on the Acucall project' })
    const written = JSON.parse(vi.mocked(writeFile).mock.calls[0][1] as string)
    expect(written.entries).toHaveLength(2)
  })

  it('returns a friendly error string on write failure rather than throwing', async () => {
    vi.mocked(readFile).mockResolvedValueOnce('{"entries":[]}')
    vi.mocked(writeFile).mockRejectedValueOnce(new Error('disk full'))
    const result = await rememberFactTool.execute({ category: 'fact', text: 'x' })
    expect(result).toContain('disk full')
  })
})
