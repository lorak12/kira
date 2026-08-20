import { app, safeStorage } from 'electron'
import { readFile, writeFile, mkdir, unlink } from 'fs/promises'
import { dirname, join } from 'path'
import type { GoogleTokens } from './types'

export function tokenStorePath(): string {
  // Deliberately always userData, no dev-cwd fallback like configPath()/
  // personaPath() -- a token file has no "hand-edit it in dev" use case,
  // and this keeps it well away from ever landing in the repo by accident.
  return join(app.getPath('userData'), 'google-tokens.enc')
}

export async function saveTokens(tokens: GoogleTokens): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      "Can't securely store the Google token on this system (OS-level encryption is unavailable) -- refusing to save it in plaintext."
    )
  }
  const path = tokenStorePath()
  await mkdir(dirname(path), { recursive: true })
  const encrypted = safeStorage.encryptString(JSON.stringify(tokens))
  await writeFile(path, encrypted)
}

export async function loadTokens(): Promise<GoogleTokens | null> {
  try {
    const buf = await readFile(tokenStorePath())
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('[kira] found a stored Google token but encryption is unavailable on this system -- treating as unlinked.')
      return null
    }
    const decrypted = safeStorage.decryptString(buf)
    return JSON.parse(decrypted) as GoogleTokens
  } catch {
    return null
  }
}

export async function clearTokens(): Promise<void> {
  try {
    await unlink(tokenStorePath())
  } catch {
    // Nothing to clear -- fine.
  }
}
