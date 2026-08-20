import { describe, it, expect, vi } from 'vitest'
import { createGoogleSlidesTools, extractSlidesOutline } from './googleSlides'
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
  const [read, create] = createGoogleSlidesTools(fakeAuth)
  return { read, create }
}

describe('extractSlidesOutline', () => {
  it('numbers each slide with its flattened text', () => {
    const outline = extractSlidesOutline({
      slides: [
        { pageElements: [{ shape: { text: { textElements: [{ textRun: { content: 'Intro' } }] } } }] },
        { pageElements: [{ shape: { text: { textElements: [{ textRun: { content: 'Roadmap' } }] } } }] }
      ]
    })
    expect(outline).toBe('1. Intro 2. Roadmap')
  })

  it('marks a slide with no text', () => {
    expect(extractSlidesOutline({ slides: [{}] })).toBe('1. (no text)')
  })
})

describe('read_slides_outline', () => {
  it('is not risky', () => {
    expect(tools().read.risky).toBe(false)
  })

  it('returns the title and outline', async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce({
      presentationId: 'p1',
      title: 'Q3 Review',
      slides: [{ pageElements: [{ shape: { text: { textElements: [{ textRun: { content: 'Summary' } }] } } }] }]
    })
    const result = await tools().read.execute({ presentationId: 'p1' })
    expect(result).toContain('Q3 Review')
    expect(result).toContain('Summary')
  })

  it('reports a presentation with no slides', async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce({ presentationId: 'p1', title: 'Empty', slides: [] })
    const result = await tools().read.execute({ presentationId: 'p1' })
    expect(result).toContain('no slides yet')
  })
})

describe('create_slide', () => {
  it('is risky', () => {
    expect(tools().create.risky).toBe(true)
  })

  it('confirms after adding a slide', async () => {
    vi.mocked(googleFetchJson).mockResolvedValueOnce(undefined)
    const result = await tools().create.execute({ presentationId: 'p1', title: 'New Slide' })
    expect(result).toContain('Slide added')
  })
})
