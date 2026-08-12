import { describe, it, expect, vi } from 'vitest'
import { shell } from 'electron'
import { openSettingsTool } from './settings'

vi.mock('../config/configStore', () => ({
  configPath: () => 'C:\\fake\\kira.config.json'
}))

describe('openSettingsTool.execute', () => {
  it('opens the config file and mentions a restart is needed', async () => {
    vi.mocked(shell.openPath).mockResolvedValueOnce('')
    const result = await openSettingsTool.execute({})
    expect(shell.openPath).toHaveBeenCalledWith('C:\\fake\\kira.config.json')
    expect(result).toContain('kira.config.json')
    expect(result).toContain('restart')
  })

  it('reports a friendly error when the OS refuses to open it', async () => {
    vi.mocked(shell.openPath).mockResolvedValueOnce('No application registered')
    const result = await openSettingsTool.execute({})
    expect(result).toContain("Couldn't open the config file")
    expect(result).toContain('No application registered')
  })
})
