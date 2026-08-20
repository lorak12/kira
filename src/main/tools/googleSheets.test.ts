import { describe, it, expect, vi } from 'vitest'
import { createGoogleSheetsTools } from './googleSheets'
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
  const [read, append] = createGoogleSheetsTools(fakeAuth)
  return { read, append }
}

describe('read_sheet_range', () => {
  it('is not risky', () => {
    expect(tools().read.risky).toBe(false)
  })

  it('reports an empty range', async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce({})
    const result = await tools().read.execute({ spreadsheetId: 's1', range: 'Sheet1!A1:A1' })
    expect(result).toContain('empty')
  })

  it('formats rows of values', async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce({ values: [['a', 'b'], ['c', 'd']] })
    const result = await tools().read.execute({ spreadsheetId: 's1', range: 'Sheet1!A1:B2' })
    expect(result).toContain('a, b')
    expect(result).toContain('c, d')
  })
})

describe('append_sheet_row', () => {
  it('is risky', () => {
    expect(tools().append.risky).toBe(true)
  })

  it('splits the comma-separated values string and appends', async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce(undefined)
    const result = await tools().append.execute({ spreadsheetId: 's1', range: 'Sheet1!A1', values: '2026-08-20, groceries, 42.50' })
    expect(result).toContain('Row added')
    const body = JSON.parse((vi.mocked(googleFetchJson).mock.calls[0][2] as RequestInit).body as string)
    expect(body.values).toEqual([['2026-08-20', 'groceries', '42.50']])
  })
})
