import { describe, it, expect, vi } from 'vitest'
import { runPowerShell } from './shell'
import { describeActiveWindow, getActiveWindowTool } from './context'

vi.mock('./shell', () => ({
  runPowerShell: vi.fn(async () => '')
}))

describe('describeActiveWindow', () => {
  it('formats a process with a distinct window title', () => {
    expect(describeActiveWindow('Code|index.ts - jarvis - Visual Studio Code')).toBe(
      'Code -- "index.ts - jarvis - Visual Studio Code"'
    )
  })

  it('omits a redundant title that just repeats the process name', () => {
    expect(describeActiveWindow('Discord|Discord')).toBe('Discord')
  })

  it('handles a process with no window title', () => {
    expect(describeActiveWindow('explorer|')).toBe('explorer')
  })

  it('reports unknown for an UNKNOWN sentinel or empty output', () => {
    expect(describeActiveWindow('UNKNOWN')).toContain("Couldn't tell")
    expect(describeActiveWindow('  ')).toContain("Couldn't tell")
  })

  it('keeps a pipe character that is actually part of the window title', () => {
    expect(describeActiveWindow('opera|Kira — Claude | Anthropic')).toBe('opera -- "Kira — Claude | Anthropic"')
  })
})

describe('getActiveWindowTool.execute', () => {
  it('reports the parsed active window on success', async () => {
    vi.mocked(runPowerShell).mockResolvedValueOnce('Spotify|Now Playing')
    expect(await getActiveWindowTool.execute({})).toBe('Spotify -- "Now Playing"')
  })

  it('returns a friendly error if the script fails', async () => {
    vi.mocked(runPowerShell).mockRejectedValueOnce(new Error('access denied'))
    const result = await getActiveWindowTool.execute({})
    expect(result).toContain("Couldn't check the active window")
    expect(result).toContain('access denied')
  })
})
