export interface GoogleTokens {
  accessToken: string
  accessTokenExpiresAt: number // epoch ms
  refreshToken: string
  scopes: string[]
}
