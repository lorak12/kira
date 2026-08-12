import { describe, it, expect, vi } from 'vitest'
import { runPowerShell } from './shell'
import { listRunningAppsTool, closeAppTool } from './appOps'

vi.mock('./shell', () => ({ runPowerShell: vi.fn(async () => '') }))

describe('listRunningAppsTool.execute', () => {
  it('reports the open apps', async () => {
    vi.mocked(runPowerShell).mockResolvedValueOnce('Discord\r\nChrome\r\nSpotify')
    const result = await listRunningAppsTool.execute({})
    expect(result).toBe('Open apps: Discord, Chrome, Spotify.')
  })

  it('reports when nothing is open', async () => {
    vi.mocked(runPowerShell).mockResolvedValueOnce('')
    const result = await listRunningAppsTool.execute({})
    expect(result).toContain('No applications')
  })

  it('returns a friendly error on failure', async () => {
    vi.mocked(runPowerShell).mockRejectedValueOnce(new Error('boom'))
    const result = await listRunningAppsTool.execute({})
    expect(result).toContain("Couldn't list open apps")
  })
})

describe('closeAppTool', () => {
  it('is marked risky', () => {
    expect(closeAppTool.risky).toBe(true)
  })

  it('requires an app name', async () => {
    const result = await closeAppTool.execute({ appName: '' })
    expect(result).toContain('which app to close')
    expect(runPowerShell).not.toHaveBeenCalled()
  })

  it('reports success', async () => {
    vi.mocked(runPowerShell).mockResolvedValueOnce('CLOSED:1')
    const result = await closeAppTool.execute({ appName: 'Discord' })
    expect(result).toBe('Closed Discord.')
  })

  it('reports when no matching process is found', async () => {
    vi.mocked(runPowerShell).mockResolvedValueOnce('NOT_FOUND')
    const result = await closeAppTool.execute({ appName: 'Nonexistent' })
    expect(result).toContain('No running app found')
  })
})
