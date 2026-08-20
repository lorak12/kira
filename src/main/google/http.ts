import type { GoogleAuthManager } from './authManager'

interface GoogleErrorBody {
  error?: { message?: string }
}

/**
 * Authenticated fetch seam for Google REST tools -- mirrors tools/http.ts's
 * fetchJson shape (so tool tests can `vi.mock('../google/http')` the same
 * way weather.test.ts mocks `./http`), but attaches the Bearer token and
 * supports arbitrary methods/bodies since Google tools need POST/PATCH/DELETE,
 * not just GET.
 */
export async function googleFetchJson<T>(
  url: string,
  auth: GoogleAuthManager,
  init?: RequestInit,
  signal?: AbortSignal
): Promise<T> {
  const accessToken = await auth.getAccessToken()
  const res = await fetch(url, {
    ...init,
    signal,
    headers: {
      ...(init?.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${accessToken}`
    }
  })
  if (!res.ok) {
    let message = `${res.status}`
    try {
      const body = (await res.json()) as GoogleErrorBody
      if (body.error?.message) message = body.error.message
    } catch {
      // Body wasn't JSON -- stick with the bare status.
    }
    throw new Error(`Google API request failed: ${message}`)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
