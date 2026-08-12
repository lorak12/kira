import { describe, it, expect, vi } from 'vitest'
import { runPowerShell } from './shell'
import { setBrightnessTool } from './brightness'

vi.mock('./shell', () => ({ runPowerShell: vi.fn(async () => 'OK') }))

describe('setBrightnessTool.execute', () => {
  it('clamps and reports the applied level', async () => {
    const result = await setBrightnessTool.execute({ level: -20 })
    expect(result).toBe('Brightness set to 0%.')
  })

  it('gives a friendly message when the display lacks WMI brightness support', async () => {
    vi.mocked(runPowerShell).mockResolvedValueOnce('ERROR:No instance found')
    const result = await setBrightnessTool.execute({ level: 50 })
    expect(result).toContain("doesn't support software brightness control")
  })

  it('returns a friendly error if the shell call throws', async () => {
    vi.mocked(runPowerShell).mockRejectedValueOnce(new Error('boom'))
    const result = await setBrightnessTool.execute({ level: 50 })
    expect(result).toContain("Couldn't set brightness")
  })
})
