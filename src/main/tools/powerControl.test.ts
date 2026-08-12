import { describe, it, expect, vi } from 'vitest'
import { runCommand } from './shell'
import { buildPowerCommand, lockScreenTool, systemPowerTool, cancelShutdownTool } from './powerControl'

vi.mock('./shell', () => ({ runCommand: vi.fn(async () => '') }))

describe('buildPowerCommand', () => {
  it('locks via user32 LockWorkStation', () => {
    expect(buildPowerCommand('lock')).toEqual({ cmd: 'rundll32.exe', args: ['user32.dll,LockWorkStation'] })
  })

  it('shuts down with a grace period, not instantly', () => {
    const { cmd, args } = buildPowerCommand('shutdown')
    expect(cmd).toBe('shutdown.exe')
    expect(args).toEqual(['/s', '/t', '8'])
  })

  it('restarts with /r', () => {
    expect(buildPowerCommand('restart').args).toContain('/r')
  })
})

describe('lockScreenTool.execute', () => {
  it('runs immediately without confirmation gating (risky: false)', async () => {
    expect(lockScreenTool.risky).toBe(false)
    const result = await lockScreenTool.execute({})
    expect(runCommand).toHaveBeenCalledWith('rundll32.exe', ['user32.dll,LockWorkStation'])
    expect(result).toBe('Locking your screen.')
  })
})

describe('systemPowerTool.execute', () => {
  it('is marked risky so it goes through the confirmation flow', () => {
    expect(systemPowerTool.risky).toBe(true)
  })

  it('shuts down and mentions how to cancel', async () => {
    const result = await systemPowerTool.execute({ action: 'shutdown' })
    expect(result).toContain('Shutting down in 8 seconds')
    expect(result).toContain('cancel')
  })

  it('rejects "lock" (that lives on the non-risky tool)', async () => {
    const result = await systemPowerTool.execute({ action: 'lock' })
    expect(result).toContain('Unknown power action')
    expect(runCommand).not.toHaveBeenCalled()
  })

  it('returns a friendly error if the command fails', async () => {
    vi.mocked(runCommand).mockRejectedValueOnce(new Error('boom'))
    const result = await systemPowerTool.execute({ action: 'restart' })
    expect(result).toContain("Couldn't do that")
  })
})

describe('cancelShutdownTool.execute', () => {
  it('cancels a pending shutdown', async () => {
    const result = await cancelShutdownTool.execute({})
    expect(runCommand).toHaveBeenCalledWith('shutdown.exe', ['/a'])
    expect(result).toContain('Cancelled')
  })

  it('reports gracefully when nothing was pending', async () => {
    vi.mocked(runCommand).mockRejectedValueOnce(new Error('no shutdown pending'))
    const result = await cancelShutdownTool.execute({})
    expect(result).toContain('no pending shutdown')
  })
})
