import { describe, it, expect, vi } from 'vitest'
import { createGoogleDocsTools, extractDocText } from './googleDocs'
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
  const [read, create] = createGoogleDocsTools(fakeAuth)
  return { read, create }
}

describe('extractDocText', () => {
  it('flattens paragraph text runs into plain text', () => {
    const text = extractDocText({
      body: {
        content: [
          { paragraph: { elements: [{ textRun: { content: 'Hello ' } }, { textRun: { content: 'world.' } }] } }
        ]
      }
    })
    expect(text).toBe('Hello world.')
  })

  it('returns empty string for an empty body', () => {
    expect(extractDocText({})).toBe('')
  })
})

describe('read_google_doc', () => {
  it('is not risky', () => {
    expect(tools().read.risky).toBe(false)
  })

  it('returns the doc title and flattened text', async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce({
      documentId: 'd1',
      title: 'Meeting Notes',
      body: { content: [{ paragraph: { elements: [{ textRun: { content: 'Agenda item 1' } }] } }] }
    })
    const result = await tools().read.execute({ docId: 'd1' })
    expect(result).toContain('Meeting Notes')
    expect(result).toContain('Agenda item 1')
  })

  it('reports an empty document', async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce({ documentId: 'd1', title: 'Empty Doc', body: { content: [] } })
    const result = await tools().read.execute({ docId: 'd1' })
    expect(result).toContain('appears to be empty')
  })
})

describe('create_google_doc', () => {
  it('is risky', () => {
    expect(tools().create.risky).toBe(true)
  })

  it('creates a doc and confirms by title', async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce({ documentId: 'd1', title: 'New Doc' })
    const result = await tools().create.execute({ title: 'New Doc' })
    expect(result).toContain('New Doc')
    expect(googleFetchJson).toHaveBeenCalledTimes(1)
  })

  it('also inserts content via batchUpdate when content is given', async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce({ documentId: 'd1', title: 'New Doc' }).mockResolvedValueOnce(undefined)
    await tools().create.execute({ title: 'New Doc', content: 'Initial text' })
    expect(googleFetchJson).toHaveBeenCalledTimes(2)
    expect(vi.mocked(googleFetchJson).mock.calls[1][0]).toContain('batchUpdate')
  })
})
