import type { ToolDefinition } from './types'
import type { GoogleAuthManager } from '../google/authManager'
import { googleFetchJson } from '../google/http'
import { runGoogleTool } from './googleErrors'

const DOCS_BASE = 'https://docs.googleapis.com/v1/documents'

interface TextRun {
  content?: string
}

interface ParagraphElement {
  textRun?: TextRun
}

interface StructuralElement {
  paragraph?: { elements?: ParagraphElement[] }
}

interface GoogleDoc {
  documentId: string
  title?: string
  body?: { content?: StructuralElement[] }
}

/** Flattens a Docs API document body into plain text. Pure/testable against a fixture object. */
export function extractDocText(doc: Pick<GoogleDoc, 'body'>): string {
  const elements = doc.body?.content ?? []
  return elements
    .flatMap((el) => el.paragraph?.elements ?? [])
    .map((el) => el.textRun?.content ?? '')
    .join('')
    .trim()
}

export function createGoogleDocsTools(auth: GoogleAuthManager): ToolDefinition[] {
  const readDocTool: ToolDefinition = {
    risky: false,
    schema: {
      name: 'read_google_doc',
      description: 'Reads the plain-text content of a Google Doc by its document ID.',
      parameters: {
        type: 'object',
        properties: {
          docId: { type: 'string', description: 'The Google Doc document ID' }
        },
        required: ['docId']
      }
    },
    async execute(args, signal) {
      return runGoogleTool(async () => {
        const doc = await googleFetchJson<GoogleDoc>(`${DOCS_BASE}/${encodeURIComponent(String(args.docId ?? ''))}`, auth, undefined, signal)
        const text = extractDocText(doc)
        if (!text) return `"${doc.title ?? 'Untitled document'}" appears to be empty.`
        return `"${doc.title ?? 'Untitled document'}": ${text}`
      })
    }
  }

  const createDocTool: ToolDefinition = {
    risky: true,
    schema: {
      name: 'create_google_doc',
      description: 'Creates a new Google Doc, optionally with initial text content.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Document title' },
          content: { type: 'string', description: 'Optional initial text content' }
        },
        required: ['title']
      }
    },
    async execute(args, signal) {
      return runGoogleTool(async () => {
        const created = await googleFetchJson<GoogleDoc>(
          DOCS_BASE,
          auth,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: String(args.title ?? '') }) },
          signal
        )
        if (args.content) {
          await googleFetchJson(
            `${DOCS_BASE}/${created.documentId}:batchUpdate`,
            auth,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requests: [{ insertText: { location: { index: 1 }, text: String(args.content) } }]
              })
            },
            signal
          )
        }
        return `Created doc "${created.title}".`
      })
    }
  }

  return [readDocTool, createDocTool]
}
