import { createServer } from 'http'
import { randomBytes } from 'crypto'
import { shell } from 'electron'
import type { GoogleTokens } from './types'

export interface OAuthClientConfig {
  clientId: string
  clientSecret: string
  scopes: string[]
}

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const AUTH_TIMEOUT_MS = 5 * 60 * 1000

interface TokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  scope?: string
  error?: string
  error_description?: string
}

async function postForm(url: string, body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString()
  })
  const json = (await res.json()) as TokenResponse
  if (!res.ok || json.error) {
    throw new Error(`Google token request failed: ${json.error_description ?? json.error ?? res.status}`)
  }
  return json
}

/**
 * Runs the interactive OAuth "loopback" consent flow: opens the system
 * browser to Google's consent screen, catches the redirect on a one-shot
 * local HTTP server bound to an ephemeral port (Google's Desktop-app client
 * type allows any 127.0.0.1 port as a redirect URI, no pre-registration
 * needed), exchanges the returned code for tokens, then closes the server.
 * Rejects on timeout, a user-denied consent, or a state-nonce mismatch
 * (defense-in-depth against another local process guessing the port).
 */
export async function runLoopbackAuthFlow(cfg: OAuthClientConfig): Promise<GoogleTokens> {
  const state = randomBytes(16).toString('hex')

  return new Promise<GoogleTokens>((resolve, reject) => {
    let redirectUri = ''

    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== '/callback') {
        res.writeHead(404).end()
        return
      }

      const respondedState = url.searchParams.get('state')
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')

      const finish = (html: string): void => {
        res.writeHead(200, { 'Content-Type': 'text/html' })
        res.end(html)
        clearTimeout(timeout)
        server.close()
      }

      if (error) {
        finish('<p>Google sign-in was cancelled. You can close this tab and return to Kira.</p>')
        reject(new Error(`Google consent was denied or cancelled: ${error}`))
        return
      }
      if (respondedState !== state || !code) {
        finish('<p>Something went wrong. You can close this tab and return to Kira.</p>')
        reject(new Error('OAuth redirect had a missing/mismatched state or code.'))
        return
      }

      finish('<p>You can close this tab and return to Kira.</p>')
      postForm(TOKEN_ENDPOINT, {
        code,
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
        .then((tokenRes) => {
          if (!tokenRes.refresh_token) {
            reject(
              new Error(
                'Google did not return a refresh token -- try unlinking and linking again (this happens if consent was already granted without prompt=consent).'
              )
            )
            return
          }
          resolve({
            accessToken: tokenRes.access_token,
            accessTokenExpiresAt: Date.now() + tokenRes.expires_in * 1000,
            refreshToken: tokenRes.refresh_token,
            scopes: cfg.scopes
          })
        })
        .catch(reject)
    })

    const timeout = setTimeout(() => {
      server.close()
      reject(new Error('Google sign-in timed out waiting for you to complete it in the browser.'))
    }, AUTH_TIMEOUT_MS)

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port
      redirectUri = `http://127.0.0.1:${port}/callback`
      const consentUrl = new URL(AUTH_ENDPOINT)
      consentUrl.searchParams.set('client_id', cfg.clientId)
      consentUrl.searchParams.set('redirect_uri', redirectUri)
      consentUrl.searchParams.set('response_type', 'code')
      consentUrl.searchParams.set('scope', cfg.scopes.join(' '))
      consentUrl.searchParams.set('access_type', 'offline')
      consentUrl.searchParams.set('prompt', 'consent')
      consentUrl.searchParams.set('state', state)
      void shell.openExternal(consentUrl.toString())
    })

    server.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

/**
 * Google doesn't rotate the refresh token on this grant type -- the caller
 * keeps reusing the one from the original link().
 */
export async function refreshAccessToken(
  cfg: Pick<OAuthClientConfig, 'clientId' | 'clientSecret'>,
  refreshToken: string
): Promise<{ accessToken: string; accessTokenExpiresAt: number }> {
  const tokenRes = await postForm(TOKEN_ENDPOINT, {
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token'
  })
  return {
    accessToken: tokenRes.access_token,
    accessTokenExpiresAt: Date.now() + tokenRes.expires_in * 1000
  }
}
