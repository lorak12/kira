import { describe, it, expect, vi, beforeEach } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { parsePersonaMarkdown } from './personaFile'

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '')
}))

vi.mock('../config/configStore', () => ({
  personaPath: vi.fn(() => '/mock/kira.persona.md')
}))

describe('parsePersonaMarkdown', () => {
  it('extracts known sections by heading, case-insensitively', () => {
    const raw = `# Kira Persona\n\n## Core Identity\nYou are Kira.\n\n## Style\nBe terse.\n\n## Expectations\nAlways mention ETA.`
    const sections = parsePersonaMarkdown(raw)
    expect(sections.coreIdentity).toBe('You are Kira.')
    expect(sections.style).toBe('Be terse.')
    expect(sections.expectations).toBe('Always mention ETA.')
    expect(sections.extra).toEqual([])
  })

  it('is case-insensitive and tolerates surrounding whitespace in headings', () => {
    const raw = `##   style   \nCasual tone.`
    const sections = parsePersonaMarkdown(raw)
    expect(sections.style).toBe('Casual tone.')
  })

  it('leaves missing sections null', () => {
    const raw = `## Style\nBe terse.`
    const sections = parsePersonaMarkdown(raw)
    expect(sections.coreIdentity).toBeNull()
    expect(sections.expectations).toBeNull()
    expect(sections.style).toBe('Be terse.')
  })

  it('passes unknown headings through verbatim as extras, in file order', () => {
    const raw = `## Notes\nSome free text.\n\n## Quirks\nHates being called Alexa.`
    const sections = parsePersonaMarkdown(raw)
    expect(sections.extra).toEqual([
      { heading: 'Notes', body: 'Some free text.' },
      { heading: 'Quirks', body: 'Hates being called Alexa.' }
    ])
  })

  it('returns all-null/empty for a file with no ## headings', () => {
    const sections = parsePersonaMarkdown('# Just a title\nsome text with no sections')
    expect(sections).toEqual({ coreIdentity: null, style: null, expectations: null, extra: [] })
  })

  it('returns all-null/empty for an empty string', () => {
    expect(parsePersonaMarkdown('')).toEqual({ coreIdentity: null, style: null, expectations: null, extra: [] })
  })

  it('drops a section with a heading but no body', () => {
    const raw = `## Style\n\n## Expectations\nAlways mention ETA.`
    const sections = parsePersonaMarkdown(raw)
    expect(sections.style).toBeNull()
    expect(sections.expectations).toBe('Always mention ETA.')
  })
})

describe('loadPersona', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.mocked(existsSync).mockReturnValue(false)
    vi.mocked(readFileSync).mockReturnValue('')
  })

  it('returns empty sections when the persona file does not exist', async () => {
    vi.mocked(existsSync).mockReturnValue(false)
    const { loadPersona } = await import('./personaFile')
    expect(loadPersona()).toEqual({ coreIdentity: null, style: null, expectations: null, extra: [] })
  })

  it('reads and parses the file when present', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue('## Style\nBe terse.')
    const { loadPersona } = await import('./personaFile')
    expect(loadPersona().style).toBe('Be terse.')
  })

  it('caches the result across calls (reads the file at most once)', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockReturnValue('## Style\nBe terse.')
    const { loadPersona } = await import('./personaFile')
    loadPersona()
    loadPersona()
    expect(readFileSync).toHaveBeenCalledTimes(1)
  })

  it('falls back to empty sections if reading throws', async () => {
    vi.mocked(existsSync).mockReturnValue(true)
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('EACCES')
    })
    const { loadPersona } = await import('./personaFile')
    expect(loadPersona()).toEqual({ coreIdentity: null, style: null, expectations: null, extra: [] })
  })
})
