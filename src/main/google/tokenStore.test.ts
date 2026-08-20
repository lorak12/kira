import { describe, it, expect, vi } from 'vitest'
import { readFile, writeFile, mkdir, unlink } from 'fs/promises'
import { safeStorage } from 'electron'
import { saveTokens, loadTokens, clearTokens, tokenStorePath } from './tokenStore'

vi.mock('fs/promises', () => ({
  readFile: vi.fn(async () => Buffer.from('')),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
  unlink: vi.fn(async () => undefined)
}))

const TOKENS = {
  accessToken: 'access-1',
  accessTokenExpiresAt: 123,
  refreshToken: 'refresh-1',
  scopes: ['https://www.googleapis.com/auth/calendar']
}

describe('tokenStorePath', () => {
  it('lives under userData', () => {
    expect(tokenStorePath()).toContain('google-tokens.enc')
    expect(tokenStorePath()).toContain('userData')
  })
})

describe('saveTokens', () => {
  it('encrypts and writes the tokens', async () => {
    await saveTokens(TOKENS)
    expect(mkdir).toHaveBeenCalled()
    expect(safeStorage.encryptString).toHaveBeenCalledWith(JSON.stringify(TOKENS))
    expect(writeFile).toHaveBeenCalledWith(expect.stringContaining('google-tokens.enc'), expect.any(Buffer))
  })

  it('refuses to save (and does not write) when encryption is unavailable', async () => {
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValueOnce(false)
    await expect(saveTokens(TOKENS)).rejects.toThrow(/securely store/)
    expect(writeFile).not.toHaveBeenCalled()
  })
})

describe('loadTokens', () => {
  it('returns null when no file exists', async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'))
    expect(await loadTokens()).toBeNull()
  })

  it('decrypts and parses a stored token file', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(Buffer.from('encrypted'))
    vi.mocked(safeStorage.decryptString).mockReturnValueOnce(JSON.stringify(TOKENS))
    expect(await loadTokens()).toEqual(TOKENS)
  })

  it('returns null (not throw) on corrupt/undecryptable content', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(Buffer.from('garbage'))
    vi.mocked(safeStorage.decryptString).mockImplementationOnce(() => {
      throw new Error('bad data')
    })
    expect(await loadTokens()).toBeNull()
  })

  it('returns null when encryption is unavailable even if a file exists', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(Buffer.from('encrypted'))
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValueOnce(false)
    expect(await loadTokens()).toBeNull()
  })
})

describe('clearTokens', () => {
  it('deletes the token file', async () => {
    await clearTokens()
    expect(unlink).toHaveBeenCalledWith(expect.stringContaining('google-tokens.enc'))
  })

  it('does not throw if there was nothing to delete', async () => {
    vi.mocked(unlink).mockRejectedValueOnce(new Error('ENOENT'))
    await expect(clearTokens()).resolves.toBeUndefined()
  })
})
