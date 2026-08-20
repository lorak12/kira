import { describe, it, expect, vi } from 'vitest'
import { createGoogleAuthManager, GoogleAuthError } from './authManager'
import { loadTokens, saveTokens, clearTokens } from './tokenStore'
import { runLoopbackAuthFlow, refreshAccessToken } from './oauthClient'
import type { KiraConfig } from '../config/schema'

vi.mock('./tokenStore', () => ({
  loadTokens: vi.fn(async () => null),
  saveTokens: vi.fn(async () => undefined),
  clearTokens: vi.fn(async () => undefined)
}))

vi.mock('./oauthClient', () => ({
  runLoopbackAuthFlow: vi.fn(),
  refreshAccessToken: vi.fn()
}))

function configWith(overrides: Partial<KiraConfig['google']> = {}): KiraConfig {
  return {
    google: { clientId: 'id', clientSecret: 'secret', enabledServices: ['calendar'], ...overrides }
  } as unknown as KiraConfig
}

const VALID_TOKENS = {
  accessToken: 'access-1',
  accessTokenExpiresAt: Date.now() + 3600_000,
  refreshToken: 'refresh-1',
  scopes: ['https://www.googleapis.com/auth/calendar']
}

describe('getAccessToken', () => {
  it('throws GoogleAuthError when never linked', async () => {
    const auth = createGoogleAuthManager(configWith())
    await expect(auth.getAccessToken()).rejects.toThrow(GoogleAuthError)
  })

  it('returns the cached token when not near expiry', async () => {
    vi.mocked(loadTokens).mockResolvedValueOnce(VALID_TOKENS)
    const auth = createGoogleAuthManager(configWith())
    expect(await auth.getAccessToken()).toBe('access-1')
    expect(refreshAccessToken).not.toHaveBeenCalled()
  })

  it('refreshes when the token is near/past expiry, and persists the refreshed token', async () => {
    vi.mocked(loadTokens).mockResolvedValueOnce({ ...VALID_TOKENS, accessTokenExpiresAt: Date.now() - 1000 })
    vi.mocked(refreshAccessToken).mockResolvedValueOnce({ accessToken: 'access-2', accessTokenExpiresAt: Date.now() + 3600_000 })
    const auth = createGoogleAuthManager(configWith())
    expect(await auth.getAccessToken()).toBe('access-2')
    expect(saveTokens).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'access-2' }))
  })

  it('throws GoogleAuthError if client creds are missing when a refresh is needed', async () => {
    vi.mocked(loadTokens).mockResolvedValueOnce({ ...VALID_TOKENS, accessTokenExpiresAt: Date.now() - 1000 })
    const auth = createGoogleAuthManager(configWith({ clientId: undefined, clientSecret: undefined }))
    await expect(auth.getAccessToken()).rejects.toThrow(GoogleAuthError)
  })
})

describe('isLinked', () => {
  it('false when nothing stored', async () => {
    const auth = createGoogleAuthManager(configWith())
    expect(await auth.isLinked()).toBe(false)
  })

  it('true once tokens are loaded', async () => {
    vi.mocked(loadTokens).mockResolvedValueOnce(VALID_TOKENS)
    const auth = createGoogleAuthManager(configWith())
    expect(await auth.isLinked()).toBe(true)
  })
})

describe('link', () => {
  it('runs the loopback flow, saves tokens, and reports linked afterward', async () => {
    vi.mocked(runLoopbackAuthFlow).mockResolvedValueOnce(VALID_TOKENS)
    const auth = createGoogleAuthManager(configWith())
    const result = await auth.link()
    expect(result).toContain('linked')
    expect(saveTokens).toHaveBeenCalledWith(VALID_TOKENS)
    expect(await auth.isLinked()).toBe(true)
  })

  it('throws GoogleAuthError without ever hitting the network if no services are enabled', async () => {
    const auth = createGoogleAuthManager(configWith({ enabledServices: [] }))
    await expect(auth.link()).rejects.toThrow(GoogleAuthError)
    expect(runLoopbackAuthFlow).not.toHaveBeenCalled()
  })

  it('throws GoogleAuthError if client creds are missing', async () => {
    const auth = createGoogleAuthManager(configWith({ clientId: undefined, clientSecret: undefined }))
    await expect(auth.link()).rejects.toThrow(GoogleAuthError)
  })
})

describe('unlink', () => {
  it('clears stored tokens and flips isLinked back to false', async () => {
    vi.mocked(loadTokens).mockResolvedValueOnce(VALID_TOKENS)
    const auth = createGoogleAuthManager(configWith())
    expect(await auth.isLinked()).toBe(true)
    await auth.unlink()
    expect(clearTokens).toHaveBeenCalled()
    expect(await auth.isLinked()).toBe(false)
  })
})
