import { describe, it, expect, vi } from 'vitest'
import { createGoogleCalendarTools, formatEventLine } from './googleCalendar'
import { googleFetchJson } from '../google/http'
import { GoogleAuthError } from '../google/authManager'
import type { GoogleAuthManager } from '../google/authManager'

vi.mock('../google/http', () => ({ googleFetchJson: vi.fn() }))

const fakeAuth: GoogleAuthManager = {
  getAccessToken: vi.fn(async () => 'token'),
  isLinked: vi.fn(async () => true),
  link: vi.fn(async () => 'linked'),
  unlink: vi.fn(async () => undefined)
}

function tools() {
  const [list, create, update, del] = createGoogleCalendarTools(fakeAuth)
  return { list, create, update, del }
}

describe('formatEventLine', () => {
  it('formats a timed event', () => {
    const line = formatEventLine({ id: '1', summary: 'Standup', start: { dateTime: '2026-08-20T09:00:00.000Z' } })
    expect(line).toContain('Standup')
  })

  it('falls back gracefully for an untitled/timeless event', () => {
    const line = formatEventLine({ id: '1' })
    expect(line).toContain('(untitled)')
    expect(line).toContain('no time set')
  })
})

describe('list_calendar_events', () => {
  it('is not risky', () => {
    expect(tools().list.risky).toBe(false)
  })

  it('reports no matching events', async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce({ items: [] })
    const result = await tools().list.execute({})
    expect(result).toContain("don't have any matching events")
  })

  it('formats a list of upcoming events', async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce({
      items: [{ id: '1', summary: 'Standup', start: { dateTime: '2026-08-20T09:00:00.000Z' } }]
    })
    const result = await tools().list.execute({})
    expect(result).toContain('Standup')
  })

  it("surfaces a not-linked message via GoogleAuthError instead of throwing", async () => {
    vi.mocked(googleFetchJson).mockRejectedValueOnce(new GoogleAuthError("Google isn't linked yet"))
    const result = await tools().list.execute({})
    expect(result).toContain("isn't linked")
  })
})

describe('create_calendar_event', () => {
  it('is risky', () => {
    expect(tools().create.risky).toBe(true)
  })

  it('creates an event and confirms by title', async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce({ id: '1', summary: 'Dentist' })
    const result = await tools().create.execute({ summary: 'Dentist', startIso: '2026-08-21T10:00:00Z', endIso: '2026-08-21T10:30:00Z' })
    expect(result).toContain('Dentist')
  })
})

describe('update_calendar_event', () => {
  it('is risky', () => {
    expect(tools().update.risky).toBe(true)
  })

  it('updates and confirms', async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce({ id: '1', summary: 'Dentist (moved)' })
    const result = await tools().update.execute({ eventId: '1', summary: 'Dentist (moved)' })
    expect(result).toContain('Dentist (moved)')
  })
})

describe('delete_calendar_event', () => {
  it('is risky', () => {
    expect(tools().del.risky).toBe(true)
  })

  it('deletes and confirms', async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce(undefined)
    const result = await tools().del.execute({ eventId: '1' })
    expect(result).toContain('deleted')
  })

  it('returns a friendly error string on failure rather than throwing', async () => {
    vi.mocked(googleFetchJson).mockRejectedValueOnce(new Error('404 not found'))
    const result = await tools().del.execute({ eventId: 'missing' })
    expect(result).toContain('404 not found')
  })
})
