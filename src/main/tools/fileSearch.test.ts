import { describe, it, expect, vi } from 'vitest'
import { readdir } from 'fs/promises'
import { shell } from 'electron'
import { scoreFileMatch, rankFiles, findFilesTool, openFileTool } from './fileSearch'

vi.mock('fs/promises', () => ({ readdir: vi.fn(async () => []) }))

describe('scoreFileMatch', () => {
  it('scores an exact filename match highest', () => {
    expect(scoreFileMatch('report.pdf', 'C:/Documents/report.pdf')).toBe(100)
  })

  it('scores a prefix match above a substring match', () => {
    const prefix = scoreFileMatch('report', 'C:/Documents/report-final.pdf')
    const substring = scoreFileMatch('final', 'C:/Documents/report-final.pdf')
    expect(prefix).toBeGreaterThan(substring)
  })

  it('returns 0 for no match', () => {
    expect(scoreFileMatch('xyz', 'report.pdf')).toBe(0)
  })

  it('returns 0 for an empty query', () => {
    expect(scoreFileMatch('', 'report.pdf')).toBe(0)
  })
})

describe('rankFiles', () => {
  it('sorts best matches first and caps to maxResults', () => {
    const candidates = ['a/report-final.pdf', 'a/report.pdf', 'a/summary.pdf']
    const result = rankFiles('report.pdf', candidates, 1)
    expect(result).toEqual(['a/report.pdf'])
  })

  it('excludes non-matches', () => {
    expect(rankFiles('zzz', ['a/report.pdf'])).toEqual([])
  })
})

describe('findFilesTool.execute', () => {
  it('asks for a query when none is given', async () => {
    const result = await findFilesTool.execute({ query: '' })
    expect(result).toContain('something to search for')
  })

  it('reports no matches when nothing is found', async () => {
    vi.mocked(readdir).mockResolvedValue([])
    const result = await findFilesTool.execute({ query: 'nonexistent' })
    expect(result).toContain('No files found')
  })

  it('reports matches found across searched directories', async () => {
    vi.mocked(readdir).mockImplementation(async () => [
      { name: 'resume.pdf', parentPath: 'C:/Users/x/Desktop', isFile: () => true } as unknown as never
    ])
    const result = await findFilesTool.execute({ query: 'resume' })
    expect(result).toContain('resume.pdf')
  })
})

describe('openFileTool.execute', () => {
  it('opens a given file path', async () => {
    vi.mocked(shell.openPath).mockResolvedValueOnce('')
    const result = await openFileTool.execute({ path: 'C:/Users/x/Desktop/resume.pdf' })
    expect(shell.openPath).toHaveBeenCalledWith('C:/Users/x/Desktop/resume.pdf')
    expect(result).toBe('Opened resume.pdf.')
  })

  it('surfaces an error string from shell.openPath', async () => {
    vi.mocked(shell.openPath).mockResolvedValueOnce('file not found')
    const result = await openFileTool.execute({ path: 'C:/nope.pdf' })
    expect(result).toContain("Couldn't open that file")
  })

  it('requires a path', async () => {
    const result = await openFileTool.execute({})
    expect(result).toContain('No file path given')
  })
})
