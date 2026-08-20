import type { KiraConfig } from '../config/schema'
import { runLoopbackAuthFlow, refreshAccessToken } from './oauthClient'
import { loadTokens, saveTokens, clearTokens } from './tokenStore'
import { scopesForConfig } from './scopes'
import type { GoogleTokens } from './types'

export class GoogleAuthError extends Error {}

export interface GoogleAuthManager {
  getAccessToken(): Promise<string>
  isLinked(): Promise<boolean>
  link(): Promise<string>
  unlink(): Promise<void>
}

// Refresh this long before actual expiry so a slow API call started right
// at the boundary doesn't get a token that expires mid-request.
const REFRESH_SKEW_MS = 60_000

export function createGoogleAuthManager(config: KiraConfig): GoogleAuthManager {
  // In-memory cache of the current token, same pattern as configStore.ts's
  // cachedConfig -- avoids a disk read + safeStorage decrypt on every tool
  // call. Seeded lazily from tokenStore.ts on first use.
  let cached: GoogleTokens | null = null
  let loadedFromDisk = false

  function requireClientCreds(): { clientId: string; clientSecret: string } {
    const { clientId, clientSecret } = config.google
    if (!clientId || !clientSecret) {
      throw new GoogleAuthError(
        'Google integration is missing google.clientId/google.clientSecret in kira.config.json -- create an OAuth Desktop-app client in Google Cloud Console and add them.'
      )
    }
    return { clientId, clientSecret }
  }

  async function ensureLoaded(): Promise<void> {
    if (loadedFromDisk) return
    cached = await loadTokens()
    loadedFromDisk = true
  }

  return {
    async getAccessToken(): Promise<string> {
      await ensureLoaded()
      if (!cached) {
        throw new GoogleAuthError("Google isn't linked yet -- say \"link my Google account\" to set it up.")
      }
      if (Date.now() < cached.accessTokenExpiresAt - REFRESH_SKEW_MS) {
        return cached.accessToken
      }
      const creds = requireClientCreds()
      const refreshed = await refreshAccessToken(creds, cached.refreshToken)
      cached = { ...cached, ...refreshed }
      await saveTokens(cached)
      return cached.accessToken
    },

    async isLinked(): Promise<boolean> {
      await ensureLoaded()
      return cached !== null
    },

    async link(): Promise<string> {
      const creds = requireClientCreds()
      const scopes = scopesForConfig(config)
      if (!scopes.length) {
        throw new GoogleAuthError(
          'No Google services are enabled in google.enabledServices in kira.config.json -- enable at least one before linking.'
        )
      }
      const tokens = await runLoopbackAuthFlow({ ...creds, scopes })
      await saveTokens(tokens)
      cached = tokens
      loadedFromDisk = true
      return 'Google account linked.'
    },

    async unlink(): Promise<void> {
      await clearTokens()
      cached = null
      loadedFromDisk = true
    }
  }
}
