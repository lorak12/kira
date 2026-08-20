import { describe, it, expect, vi, beforeEach } from 'vitest'
import { shell } from 'electron'
import { runLoopbackAuthFlow, refreshAccessToken } from './oauthClient'

// The loopback flow makes two kinds of fetch() calls: the test's own call
// hitting the real local server it started (127.0.0.1), and the module's
// own call to Google's token endpoint. We let the first pass through to the
// real global fetch (a real local socket, fast/deterministic, no need to
// mock it) and stub only the second via `nextExternalResponse`.
const realFetch = globalThis.fetch
let nextExternalResponse: Response | null = null

beforeEach(() => {
  nextExternalResponse = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString()
      if (url.includes('127.0.0.1')) return realFetch(input, init)
      if (!nextExternalResponse) throw new Error(`unexpected external fetch call in test: ${url}`)
      const response = nextExternalResponse
      nextExternalResponse = null
      return response
    })
  )
})

function mockTokenExchange(body: Record<string, unknown>, status = 200): void {
  nextExternalResponse = new Response(JSON.stringify(body), { status })
}

/** Pulls the redirect_uri Kira built out of the consent URL it opened, so the test can hit it back. */
function capturedRedirectUri(): string {
  const url = new URL(vi.mocked(shell.openExternal).mock.calls[0][0])
  return url.searchParams.get('redirect_uri')!
}

function capturedState(): string {
  const url = new URL(vi.mocked(shell.openExternal).mock.calls[0][0])
  return url.searchParams.get('state')!
}

describe('runLoopbackAuthFlow', () => {
  it('opens the consent screen, catches the redirect, and exchanges the code for tokens', async () => {
    mockTokenExchange({ access_token: 'at-1', expires_in: 3600, refresh_token: 'rt-1' })

    const flow = runLoopbackAuthFlow({ clientId: 'id', clientSecret: 'secret', scopes: ['scope-a'] })

    await vi.waitFor(() => expect(shell.openExternal).toHaveBeenCalled())
    const redirectUri = capturedRedirectUri()
    const state = capturedState()

    await realFetch(`${redirectUri}?code=abc123&state=${state}`)

    const tokens = await flow
    expect(tokens).toEqual({
      accessToken: 'at-1',
      accessTokenExpiresAt: expect.any(Number),
      refreshToken: 'rt-1',
      scopes: ['scope-a']
    })
  })

  it('rejects when Google reports consent was denied', async () => {
    const flow = runLoopbackAuthFlow({ clientId: 'id', clientSecret: 'secret', scopes: ['scope-a'] })
    // Attach a handler immediately -- the server rejects `flow` synchronously
    // while handling the redirect request below, which can race ahead of the
    // `.rejects.toThrow()` assertion attaching its own handler and trip
    // Node's unhandledRejection warning otherwise.
    flow.catch(() => {})
    await vi.waitFor(() => expect(shell.openExternal).toHaveBeenCalled())
    const redirectUri = capturedRedirectUri()

    await realFetch(`${redirectUri}?error=access_denied`)
    await expect(flow).rejects.toThrow(/denied|cancelled/)
  })

  it('rejects on a state mismatch (defense against a guessed local port)', async () => {
    const flow = runLoopbackAuthFlow({ clientId: 'id', clientSecret: 'secret', scopes: ['scope-a'] })
    flow.catch(() => {})
    await vi.waitFor(() => expect(shell.openExternal).toHaveBeenCalled())
    const redirectUri = capturedRedirectUri()

    await realFetch(`${redirectUri}?code=abc123&state=wrong-state`)
    await expect(flow).rejects.toThrow(/state/)
  })

  it('rejects when Google does not return a refresh token', async () => {
    mockTokenExchange({ access_token: 'at-1', expires_in: 3600 })
    const flow = runLoopbackAuthFlow({ clientId: 'id', clientSecret: 'secret', scopes: ['scope-a'] })
    flow.catch(() => {})
    await vi.waitFor(() => expect(shell.openExternal).toHaveBeenCalled())
    const redirectUri = capturedRedirectUri()
    const state = capturedState()

    await realFetch(`${redirectUri}?code=abc123&state=${state}`)
    await expect(flow).rejects.toThrow(/refresh token/)
  })
})

describe('refreshAccessToken', () => {
  it('exchanges a refresh token for a new access token', async () => {
    mockTokenExchange({ access_token: 'at-2', expires_in: 1800 })
    const result = await refreshAccessToken({ clientId: 'id', clientSecret: 'secret' }, 'rt-1')
    expect(result.accessToken).toBe('at-2')
    expect(result.accessTokenExpiresAt).toBeGreaterThan(Date.now())
  })

  it('throws with the Google-provided error description on failure', async () => {
    mockTokenExchange({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400)
    await expect(refreshAccessToken({ clientId: 'id', clientSecret: 'secret' }, 'rt-1')).rejects.toThrow(
      'Token has been expired or revoked.'
    )
  })
})
