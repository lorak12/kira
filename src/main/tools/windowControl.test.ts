import { describe, it, expect, vi } from 'vitest'
import { runPowerShell } from './shell'
import { buildWindowControlScript, windowControlTool } from './windowControl'

vi.mock('./shell', () => ({ runPowerShell: vi.fn(async () => 'OK:Discord') }))

describe('buildWindowControlScript', () => {
  it('builds a close script using CloseMainWindow', () => {
    const script = buildWindowControlScript('Discord', 'close')
    expect(script).toContain('CloseMainWindow')
    expect(script).toContain('Discord')
  })

  it('builds a ShowWindow script with the right SW_ code for minimize', () => {
    const script = buildWindowControlScript('Spotify', 'minimize')
    expect(script).toContain('ShowWindow($p.MainWindowHandle, 6)')
  })

  it('includes SetForegroundWindow only for focus', () => {
    expect(buildWindowControlScript('x', 'focus')).toContain('SetForegroundWindow($p.MainWindowHandle)')
    expect(buildWindowControlScript('x', 'maximize')).not.toContain('SetForegroundWindow($p.MainWindowHandle)')
  })

  it('escapes single quotes in the app name', () => {
    const script = buildWindowControlScript("Bob's App", 'focus')
    expect(script).toContain("Bob''s App")
  })
})

describe('windowControlTool.execute', () => {
  it('rejects unknown actions without calling the shell', async () => {
    const result = await windowControlTool.execute({ appName: 'Discord', action: 'levitate' })
    expect(result).toContain('Unknown window action')
    expect(runPowerShell).not.toHaveBeenCalled()
  })

  it('reports success for a known action', async () => {
    const result = await windowControlTool.execute({ appName: 'Discord', action: 'close' })
    expect(result).toBe('Closed Discord.')
  })

  it('reports when no matching window is found', async () => {
    vi.mocked(runPowerShell).mockResolvedValueOnce('NOT_FOUND')
    const result = await windowControlTool.execute({ appName: 'Nonexistent', action: 'focus' })
    expect(result).toContain('No open window found')
  })

  it('returns a friendly error if the shell call throws', async () => {
    vi.mocked(runPowerShell).mockRejectedValueOnce(new Error('boom'))
    const result = await windowControlTool.execute({ appName: 'Discord', action: 'focus' })
    expect(result).toContain("Couldn't control the window")
  })
})
