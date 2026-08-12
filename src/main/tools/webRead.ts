import type { ToolDefinition } from './types'
import { fetchText } from './http'

// Deliberately simple regex-based extraction, not a real DOM/readability
// parser (no dependency to add, no HTML parser edge cases to chase) --
// good enough to turn a typical article/docs page into readable text for
// a spoken summary, not meant to preserve structure or handle every site.
const STRIP_TAGS_WITH_CONTENT = /<(script|style|noscript|svg|nav|header|footer|form)[^>]*>[\s\S]*?<\/\1>/gi
const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…'
}

const MAX_READABLE_CHARS = 4000

/** Strips a page down to its readable text, decoded and whitespace-collapsed. Pure/testable. */
export function extractReadableText(html: string, max = MAX_READABLE_CHARS): string {
  let text = html.replace(STRIP_TAGS_WITH_CONTENT, ' ')
  text = text.replace(/<[^>]+>/g, ' ')
  text = text.replace(/&#(\d+);/g, (_match, code: string) => String.fromCharCode(Number(code)))
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    text = text.split(entity).join(char)
  }
  text = text.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export const readWebpageTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'read_webpage',
    description:
      "Fetches a web page and returns its actual text content so YOU can read and answer questions about it. Different from web_search (which only opens a browser tab for the user to read themselves) and open_url (which just navigates there) -- use this when the user asks what a specific page/article says, or needs an answer that depends on a page's current content.",
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The full URL to read, including https://' }
      },
      required: ['url']
    }
  },
  async execute(args, signal) {
    const url = String(args.url ?? '')
    if (!/^https?:\/\//i.test(url)) return `"${url}" is not a valid URL.`
    try {
      const html = await fetchText(url, signal)
      const text = extractReadableText(html)
      return text || `Fetched ${url}, but couldn't find readable text on that page.`
    } catch (err) {
      return `Couldn't read that page: ${(err as Error).message}`
    }
  }
}
