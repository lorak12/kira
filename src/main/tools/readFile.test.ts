import { describe, it, expect, vi } from 'vitest'
import { readFile, stat } from 'fs/promises'
import { truncateFileContent, readFileTool } from './readFile'

vi.mock('fs/promises', () => ({
  readFile: vi.fn(async () => ''),
  stat: vi.fn(async () => ({ isDirectory: () => false, size: 0 }))
}))

describe('truncateFileContent', () => {
  it('trims whitespace and passes short content through unchanged', () => {
    expect(truncateFileContent('  hello  ')).toBe('hello')
  })

  it('truncates long content with an ellipsis at the given max', () => {
    const text = truncateFileContent('a'.repeat(200), 50)
    expect(text.length).toBe(50)
    expect(text.endsWith('…')).toBe(true)
  })
})

describe('readFileTool.execute', () => {
  it('rejects an empty path without touching the filesystem', async () => {
    const result = await readFileTool.execute({ path: '' })
    expect(result).toContain('No file path given')
    expect(stat).not.toHaveBeenCalled()
  })

  it('returns file contents on success', async () => {
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => false, size: 20 } as never)
    vi.mocked(readFile).mockResolvedValueOnce('the file says hello')
    const result = await readFileTool.execute({ path: 'C:\\notes.txt' })
    expect(result).toBe('the file says hello')
  })

  it('reports when the path is a directory', async () => {
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => true, size: 0 } as never)
    const result = await readFileTool.execute({ path: 'C:\\Users\\karol' })
    expect(result).toContain('is a folder, not a file')
    expect(readFile).not.toHaveBeenCalled()
  })

  it('refuses a file over the size limit without reading it', async () => {
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => false, size: 5 * 1024 * 1024 } as never)
    const result = await readFileTool.execute({ path: 'C:\\huge.log' })
    expect(result).toContain('too large')
    expect(readFile).not.toHaveBeenCalled()
  })

  it('reports an empty file distinctly', async () => {
    vi.mocked(stat).mockResolvedValueOnce({ isDirectory: () => false, size: 0 } as never)
    vi.mocked(readFile).mockResolvedValueOnce('   ')
    const result = await readFileTool.execute({ path: 'C:\\empty.txt' })
    expect(result).toBe('That file is empty.')
  })

  it('returns a friendly error when the file does not exist', async () => {
    vi.mocked(stat).mockRejectedValueOnce(new Error('ENOENT: no such file'))
    const result = await readFileTool.execute({ path: 'C:\\missing.txt' })
    expect(result).toContain("Couldn't read that file")
    expect(result).toContain('ENOENT')
  })
})
