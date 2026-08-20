import { describe, it, expect, vi } from 'vitest'
import { readFile, writeFile } from 'fs/promises'
import { loadReflectionState, saveReflectionState, reflectionStatePath } from './reflectionState'

vi.mock('fs/promises', () => ({
  readFile: vi.fn(async () => ''),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined)
}))

describe('reflectionStatePath', () => {
  it('lives under userData', () => {
    expect(reflectionStatePath()).toContain('reflection-state.json')
  })
})

describe('loadReflectionState', () => {
  it('defaults to 0 when no file exists', async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'))
    expect(await loadReflectionState()).toEqual({ sessionsSinceReflection: 0 })
  })

  it('reads a stored count', async () => {
    vi.mocked(readFile).mockResolvedValueOnce('{"sessionsSinceReflection":4}')
    expect(await loadReflectionState()).toEqual({ sessionsSinceReflection: 4 })
  })

  it('defaults to 0 on malformed content', async () => {
    vi.mocked(readFile).mockResolvedValueOnce('not json')
    expect(await loadReflectionState()).toEqual({ sessionsSinceReflection: 0 })
  })
})

describe('saveReflectionState', () => {
  it('writes the count', async () => {
    await saveReflectionState({ sessionsSinceReflection: 3 })
    expect(writeFile).toHaveBeenCalledWith(expect.stringContaining('reflection-state.json'), '{"sessionsSinceReflection":3}', 'utf-8')
  })
})
