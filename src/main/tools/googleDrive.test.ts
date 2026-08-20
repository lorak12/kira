import { describe, it, expect, vi } from 'vitest'
import { createGoogleDriveTools } from './googleDrive'
import { googleFetchJson } from '../google/http'
import type { GoogleAuthManager } from '../google/authManager'

vi.mock('../google/http', () => ({ googleFetchJson: vi.fn() }))

const fakeAuth: GoogleAuthManager = {
  getAccessToken: vi.fn(async () => 'token'),
  isLinked: vi.fn(async () => true),
  link: vi.fn(async () => 'linked'),
  unlink: vi.fn(async () => undefined)
}

function tools() {
  const [search, link] = createGoogleDriveTools(fakeAuth)
  return { search, link }
}

describe('search_drive_files', () => {
  it('is not risky', () => {
    expect(tools().search.risky).toBe(false)
  })

  it('reports no matches', async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce({ files: [] })
    const result = await tools().search.execute({ query: 'budget' })
    expect(result).toContain('No matching files')
  })

  it('lists matching files by name and id', async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce({ files: [{ id: 'f1', name: 'Budget 2026' }] })
    const result = await tools().search.execute({ query: 'budget' })
    expect(result).toContain('Budget 2026')
    expect(result).toContain('f1')
  })
})

describe('get_drive_file_link', () => {
  it('is not risky', () => {
    expect(tools().link.risky).toBe(false)
  })

  it('returns the webViewLink', async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce({ id: 'f1', name: 'Budget 2026', webViewLink: 'https://drive.google.com/f1' })
    const result = await tools().link.execute({ fileId: 'f1' })
    expect(result).toContain('https://drive.google.com/f1')
  })

  it("reports when a file has no shareable link", async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce({ id: 'f1', name: 'Budget 2026' })
    const result = await tools().link.execute({ fileId: 'f1' })
    expect(result).toContain("doesn't have a shareable link")
  })
})
