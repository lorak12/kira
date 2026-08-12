import { describe, it, expect, vi } from 'vitest'
import { fetchText } from './http'
import { extractReadableText, readWebpageTool } from './webRead'

vi.mock('./http', () => ({
  fetchText: vi.fn(async () => '')
}))

describe('extractReadableText', () => {
  it('strips tags and collapses whitespace', () => {
    const html = '<html><body><h1>Title</h1>\n<p>Hello   world.</p></body></html>'
    expect(extractReadableText(html)).toBe('Title Hello world.')
  })

  it('drops script/style/nav/header/footer content entirely, not just their tags', () => {
    const html =
      '<nav>Home About</nav><script>alert(1)</script><style>.x{color:red}</style><p>Real content.</p><footer>Copyright 2026</footer>'
    const text = extractReadableText(html)
    expect(text).toBe('Real content.')
  })

  it('decodes common HTML entities and numeric character references', () => {
    const html = '<p>Tom &amp; Jerry &mdash; caf&#233;</p>'
    expect(extractReadableText(html)).toBe('Tom & Jerry — café')
  })

  it('truncates long pages to the max length with an ellipsis', () => {
    const html = `<p>${'a'.repeat(5000)}</p>`
    const text = extractReadableText(html, 100)
    expect(text.length).toBe(100)
    expect(text.endsWith('…')).toBe(true)
  })

  it('returns an empty string for a page with no readable text', () => {
    expect(extractReadableText('<script>alert(1)</script><style>.x{}</style>')).toBe('')
  })
})

describe('readWebpageTool.execute', () => {
  it('rejects a non-URL', async () => {
    const result = await readWebpageTool.execute({ url: 'not a url' })
    expect(result).toContain('not a valid URL')
    expect(fetchText).not.toHaveBeenCalled()
  })

  it('fetches and returns readable text on success', async () => {
    vi.mocked(fetchText).mockResolvedValueOnce('<p>The answer is 42.</p>')
    const result = await readWebpageTool.execute({ url: 'https://example.com' })
    expect(result).toBe('The answer is 42.')
  })

  it('reports when the page has no readable text', async () => {
    vi.mocked(fetchText).mockResolvedValueOnce('<script>x</script>')
    const result = await readWebpageTool.execute({ url: 'https://example.com' })
    expect(result).toContain("couldn't find readable text")
  })

  it('returns a friendly error on fetch failure', async () => {
    vi.mocked(fetchText).mockRejectedValueOnce(new Error('Request to example.com failed (404).'))
    const result = await readWebpageTool.execute({ url: 'https://example.com' })
    expect(result).toContain("Couldn't read that page")
    expect(result).toContain('404')
  })
})
