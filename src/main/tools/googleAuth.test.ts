import { describe, it, expect, vi } from 'vitest'
import { createLinkGoogleAccountTool, createUnlinkGoogleAccountTool } from './googleAuth'
import { GoogleAuthError } from '../google/authManager'
import type { GoogleAuthManager } from '../google/authManager'

function fakeAuth(overrides: Partial<GoogleAuthManager> = {}): GoogleAuthManager {
  return {
    getAccessToken: vi.fn(async () => 'token'),
    isLinked: vi.fn(async () => false),
    link: vi.fn(async () => 'Google account linked.'),
    unlink: vi.fn(async () => undefined),
    ...overrides
  }
}

describe('link_google_account tool', () => {
  it('is not risky', () => {
    expect(createLinkGoogleAccountTool(fakeAuth()).risky).toBe(false)
  })

  it('reports success', async () => {
    const tool = createLinkGoogleAccountTool(fakeAuth())
    expect(await tool.execute({})).toBe('Google account linked.')
  })

  it('surfaces a GoogleAuthError message directly (e.g. missing client creds)', async () => {
    const auth = fakeAuth({ link: vi.fn(async () => { throw new GoogleAuthError('missing creds') }) })
    const tool = createLinkGoogleAccountTool(auth)
    expect(await tool.execute({})).toBe('missing creds')
  })

  it('returns a friendly string for an unexpected error rather than throwing', async () => {
    const auth = fakeAuth({ link: vi.fn(async () => { throw new Error('network down') }) })
    const tool = createLinkGoogleAccountTool(auth)
    await expect(tool.execute({})).resolves.toContain('network down')
  })
})

describe('unlink_google_account tool', () => {
  it('is risky (kills access to everything downstream)', () => {
    expect(createUnlinkGoogleAccountTool(fakeAuth()).risky).toBe(true)
  })

  it('unlinks and confirms', async () => {
    const auth = fakeAuth()
    const tool = createUnlinkGoogleAccountTool(auth)
    expect(await tool.execute({})).toBe('Google account unlinked.')
    expect(auth.unlink).toHaveBeenCalled()
  })
})
