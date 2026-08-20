import { describe, it, expect, vi, beforeEach } from 'vitest'
import { googleFetchJson } from './http'
import type { GoogleAuthManager } from './authManager'

const fakeAuth: GoogleAuthManager = {
  getAccessToken: vi.fn(async () => 'token-123'),
  isLinked: vi.fn(async () => true),
  link: vi.fn(async () => 'linked'),
  unlink: vi.fn(async () => undefined)
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

describe('googleFetchJson', () => {
  it('attaches the Authorization header from the auth manager', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await googleFetchJson('https://example.com/x', fakeAuth)
    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer token-123')
  })

  it('returns parsed JSON on success', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ hello: 'world' }), { status: 200 }))
    const result = await googleFetchJson<{ hello: string }>('https://example.com/x', fakeAuth)
    expect(result.hello).toBe('world')
  })

  it('returns undefined for a 204 No Content response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 204 }))
    const result = await googleFetchJson('https://example.com/x', fakeAuth)
    expect(result).toBeUndefined()
  })

  it("surfaces Google's error body message when present", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Invalid Credentials' } }), { status: 401 })
    )
    await expect(googleFetchJson('https://example.com/x', fakeAuth)).rejects.toThrow('Invalid Credentials')
  })

  it('falls back to the bare status when the error body is not JSON', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('not json', { status: 500 }))
    await expect(googleFetchJson('https://example.com/x', fakeAuth)).rejects.toThrow('500')
  })
})
