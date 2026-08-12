import { describe, it, expect, vi } from 'vitest'
import { runPowerShell } from './shell'
import { clampPercent, setVolumeTool } from './volume'

vi.mock('./shell', () => ({ runPowerShell: vi.fn(async () => '') }))

describe('clampPercent', () => {
  it('clamps values within range unchanged (rounded)', () => {
    expect(clampPercent(42.4)).toBe(42)
    expect(clampPercent(42.6)).toBe(43)
  })

  it('clamps below 0 up to 0', () => {
    expect(clampPercent(-10)).toBe(0)
  })

  it('clamps above 100 down to 100', () => {
    expect(clampPercent(150)).toBe(100)
  })

  it('treats non-finite input as 0', () => {
    expect(clampPercent(NaN)).toBe(0)
  })
})

describe('setVolumeTool.execute', () => {
  it('clamps and reports the applied level', async () => {
    const result = await setVolumeTool.execute({ level: 250 })
    expect(result).toBe('Volume set to 100%.')
  })

  it('passes the fractional scalar to the shim', async () => {
    await setVolumeTool.execute({ level: 50 })
    const script = vi.mocked(runPowerShell).mock.calls[0][0]
    expect(script).toContain('SetVolume(0.5)')
  })

  it('returns a friendly error on failure', async () => {
    vi.mocked(runPowerShell).mockRejectedValueOnce(new Error('boom'))
    const result = await setVolumeTool.execute({ level: 50 })
    expect(result).toContain("Couldn't set the volume")
  })
})
