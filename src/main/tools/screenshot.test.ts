import { describe, it, expect, vi } from 'vitest'
import { shell } from 'electron'
import { runPowerShell } from './shell'
import { buildScreenshotPath, screenshotTool, openScreenshotFolderTool } from './screenshot'

vi.mock('./shell', () => ({ runPowerShell: vi.fn(async () => '') }))

describe('buildScreenshotPath', () => {
  it('produces a stable, filesystem-safe timestamped path', () => {
    const path = buildScreenshotPath(new Date('2026-08-11T10:15:30.123Z'))
    expect(path).toContain('Kira Screenshots')
    expect(path).toMatch(/screenshot-2026-08-11T10-15-30\.png$/)
    expect(path).not.toMatch(/:/) // colons are invalid in Windows filenames
  })
})

describe('screenshotTool.execute', () => {
  it('runs a capture script and reports the saved path', async () => {
    const result = await screenshotTool.execute({})
    expect(runPowerShell).toHaveBeenCalledTimes(1)
    const script = vi.mocked(runPowerShell).mock.calls[0][0]
    expect(script).toContain('CopyFromScreen')
    expect(result).toMatch(/^Saved a screenshot to .*\.png\.$/)
  })

  it('returns a friendly error if capture fails', async () => {
    vi.mocked(runPowerShell).mockRejectedValueOnce(new Error('boom'))
    const result = await screenshotTool.execute({})
    expect(result).toContain("Couldn't take a screenshot")
  })
})

describe('openScreenshotFolderTool.execute', () => {
  it('opens the screenshots folder', async () => {
    const result = await openScreenshotFolderTool.execute({})
    expect(shell.openPath).toHaveBeenCalledWith(expect.stringContaining('Kira Screenshots'))
    expect(result).toBe('Opened the screenshots folder.')
  })
})
