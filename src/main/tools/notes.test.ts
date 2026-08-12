import { describe, it, expect, vi } from 'vitest'
import { appendFile, mkdir, readFile } from 'fs/promises'
import { formatNoteLine, stripNotePrefix, addNoteTool, listNotesTool, buildRecentNotesContext } from './notes'

vi.mock('fs/promises', () => ({
  appendFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
  readFile: vi.fn(async () => '')
}))

const FIXED_NOW = new Date('2026-08-11T12:00:00.000Z')

describe('formatNoteLine / stripNotePrefix', () => {
  it('round-trips content through the stored line format', () => {
    const line = formatNoteLine('buy milk', FIXED_NOW)
    expect(line).toBe('- [2026-08-11T12:00:00.000Z] buy milk')
    expect(stripNotePrefix(line)).toBe('buy milk')
  })
})

describe('addNoteTool.execute', () => {
  it('rejects empty content without touching the filesystem', async () => {
    const result = await addNoteTool.execute({ content: '   ' })
    expect(result).toContain('what to note down')
    expect(appendFile).not.toHaveBeenCalled()
  })

  it('appends the note and confirms', async () => {
    const result = await addNoteTool.execute({ content: 'call mom' })
    expect(mkdir).toHaveBeenCalled()
    expect(appendFile).toHaveBeenCalledWith(expect.stringContaining('notes.md'), expect.stringContaining('call mom'), 'utf-8')
    expect(result).toBe('Noted.')
  })

  it('returns a friendly error on write failure', async () => {
    vi.mocked(appendFile).mockRejectedValueOnce(new Error('disk full'))
    const result = await addNoteTool.execute({ content: 'x' })
    expect(result).toContain("Couldn't save that note")
  })
})

describe('listNotesTool.execute', () => {
  it('reports when there are no notes', async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'))
    const result = await listNotesTool.execute({})
    expect(result).toContain("don't have any notes")
  })

  it('lists the most recent notes, newest first, without the timestamp prefix', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(
      ['- [t1] first', '- [t2] second', '- [t3] third'].join('\n')
    )
    const result = await listNotesTool.execute({ limit: 2 })
    expect(result).toContain('third')
    expect(result).toContain('second')
    expect(result).not.toContain('first')
    expect(result).not.toContain('[t3]')
  })
})

describe('buildRecentNotesContext', () => {
  it('returns null when there are no notes -- nothing to push into a fresh session', async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'))
    expect(await buildRecentNotesContext()).toBeNull()
  })

  it('formats recent notes, newest first, as a system-context blurb', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(['- [t1] first', '- [t2] second'].join('\n'))
    const context = await buildRecentNotesContext()
    expect(context).toContain('second')
    expect(context).toContain('first')
    expect(context).not.toContain('[t1]')
    expect(context?.indexOf('second')).toBeLessThan(context?.indexOf('first') ?? -1)
  })

  it('respects a custom limit', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(['- [t1] apple', '- [t2] banana', '- [t3] cherry'].join('\n'))
    const context = await buildRecentNotesContext(1)
    const notesSegment = context?.split('unprompted: ')[1]
    expect(notesSegment).toBe('cherry.')
  })
})
