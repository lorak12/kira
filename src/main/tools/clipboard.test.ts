import { describe, it, expect, vi } from 'vitest'
import { clipboard } from 'electron'
import { readClipboardTool, writeClipboardTool } from './clipboard'

describe('readClipboardTool', () => {
  it('reports empty clipboard', async () => {
    vi.mocked(clipboard.readText).mockReturnValue('')
    const result = await readClipboardTool.execute({})
    expect(result).toBe('The clipboard is empty.')
  })

  it('returns clipboard contents', async () => {
    vi.mocked(clipboard.readText).mockReturnValue('hello world')
    const result = await readClipboardTool.execute({})
    expect(result).toBe('Clipboard contains: hello world')
  })

  it('truncates very long clipboard contents', async () => {
    vi.mocked(clipboard.readText).mockReturnValue('x'.repeat(1000))
    const result = await readClipboardTool.execute({})
    expect(result).toContain('1000 characters')
    expect(result.length).toBeLessThan(1000)
  })
})

describe('writeClipboardTool', () => {
  it('writes the given text to the clipboard', async () => {
    const result = await writeClipboardTool.execute({ text: 'copy me' })
    expect(clipboard.writeText).toHaveBeenCalledWith('copy me')
    expect(result).toBe('Copied to clipboard.')
  })
})
