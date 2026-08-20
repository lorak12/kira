import { describe, it, expect, vi } from 'vitest'
import { createGoogleGmailTools, extractPlainTextBody, buildRawEmail } from './googleGmail'
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
  const [search, get, send] = createGoogleGmailTools(fakeAuth)
  return { search, get, send }
}

describe('extractPlainTextBody', () => {
  it('reads a top-level text/plain body', () => {
    const text = extractPlainTextBody({ mimeType: 'text/plain', body: { data: Buffer.from('hello').toString('base64url') } })
    expect(text).toBe('hello')
  })

  it('finds text/plain among multipart parts', () => {
    const text = extractPlainTextBody({
      mimeType: 'multipart/alternative',
      parts: [
        { mimeType: 'text/html', body: { data: Buffer.from('<b>hi</b>').toString('base64url') } },
        { mimeType: 'text/plain', body: { data: Buffer.from('plain hi').toString('base64url') } }
      ]
    })
    expect(text).toBe('plain hi')
  })

  it('returns empty string when nothing matches', () => {
    expect(extractPlainTextBody({ mimeType: 'text/html', body: { data: 'x' } })).toBe('')
  })
})

describe('buildRawEmail', () => {
  it('produces a base64url-encoded RFC 2822 message containing the given fields', () => {
    const raw = buildRawEmail('a@b.com', 'Hi there', 'body text')
    const decoded = Buffer.from(raw, 'base64url').toString('utf-8')
    expect(decoded).toContain('To: a@b.com')
    expect(decoded).toContain('Subject: Hi there')
    expect(decoded).toContain('body text')
  })
})

describe('search_emails', () => {
  it('is not risky', () => {
    expect(tools().search.risky).toBe(false)
  })

  it('reports no matches', async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce({ messages: [] })
    const result = await tools().search.execute({ query: 'is:unread' })
    expect(result).toContain('No matching emails')
  })

  it('fetches metadata for each matching message and formats a summary', async () => {
    vi.mocked(googleFetchJson)
      .mockResolvedValueOnce({ messages: [{ id: 'm1' }] })
      .mockResolvedValueOnce({
        id: 'm1',
        snippet: 'a snippet',
        payload: { headers: [{ name: 'Subject', value: 'Invoice' }, { name: 'From', value: 'billing@x.com' }] }
      })
    const result = await tools().search.execute({ query: 'invoice' })
    expect(result).toContain('Invoice')
    expect(result).toContain('billing@x.com')
  })
})

describe('get_email', () => {
  it('is not risky', () => {
    expect(tools().get.risky).toBe(false)
  })

  it('returns the decoded plain-text body with sender/subject', async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce({
      id: 'm1',
      payload: {
        headers: [{ name: 'Subject', value: 'Hi' }, { name: 'From', value: 'a@b.com' }],
        mimeType: 'text/plain',
        body: { data: Buffer.from('the body').toString('base64url') }
      }
    })
    const result = await tools().get.execute({ messageId: 'm1' })
    expect(result).toContain('the body')
    expect(result).toContain('a@b.com')
  })
})

describe('send_email', () => {
  it('is risky', () => {
    expect(tools().send.risky).toBe(true)
  })

  it('sends and confirms the recipient', async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce({ id: 'sent-1' })
    const result = await tools().send.execute({ to: 'x@y.com', subject: 'Hi', body: 'text' })
    expect(result).toContain('x@y.com')
  })

  it('returns a friendly error string rather than throwing', async () => {
    vi.mocked(googleFetchJson).mockRejectedValueOnce(new Error('quota exceeded'))
    const result = await tools().send.execute({ to: 'x@y.com', subject: 'Hi', body: 'text' })
    expect(result).toContain('quota exceeded')
  })
})
