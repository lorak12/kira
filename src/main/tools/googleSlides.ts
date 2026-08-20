import type { ToolDefinition } from './types'
import type { GoogleAuthManager } from '../google/authManager'
import { googleFetchJson } from '../google/http'
import { runGoogleTool } from './googleErrors'

const SLIDES_BASE = 'https://slides.googleapis.com/v1/presentations'

interface TextRun {
  content?: string
}

interface TextElement {
  textRun?: TextRun
}

interface PageElement {
  shape?: { text?: { textElements?: TextElement[] } }
}

interface Slide {
  pageElements?: PageElement[]
}

interface Presentation {
  presentationId: string
  title?: string
  slides?: Slide[]
}

function slideText(slide: Slide): string {
  return (slide.pageElements ?? [])
    .flatMap((el) => el.shape?.text?.textElements ?? [])
    .map((el) => el.textRun?.content ?? '')
    .join('')
    .trim()
}

/** Flattens a presentation into a numbered "what's in it" outline, not full visual fidelity. Pure/testable. */
export function extractSlidesOutline(presentation: Pick<Presentation, 'slides'>): string {
  return (presentation.slides ?? [])
    .map((slide, i) => `${i + 1}. ${slideText(slide) || '(no text)'}`)
    .join(' ')
}

export function createGoogleSlidesTools(auth: GoogleAuthManager): ToolDefinition[] {
  const readSlidesOutlineTool: ToolDefinition = {
    risky: false,
    schema: {
      name: 'read_slides_outline',
      description: "Reads a numbered outline of the text content of each slide in a Google Slides presentation -- what's in it, not a visual description.",
      parameters: {
        type: 'object',
        properties: {
          presentationId: { type: 'string', description: 'The presentation ID' }
        },
        required: ['presentationId']
      }
    },
    async execute(args, signal) {
      return runGoogleTool(async () => {
        const presentation = await googleFetchJson<Presentation>(
          `${SLIDES_BASE}/${encodeURIComponent(String(args.presentationId ?? ''))}`,
          auth,
          undefined,
          signal
        )
        const outline = extractSlidesOutline(presentation)
        if (!outline) return `"${presentation.title ?? 'Untitled presentation'}" has no slides yet.`
        return `"${presentation.title ?? 'Untitled presentation'}": ${outline}`
      })
    }
  }

  const createSlideTool: ToolDefinition = {
    risky: true,
    schema: {
      name: 'create_slide',
      description: 'Adds a new slide with a title and optional body text to a Google Slides presentation.',
      parameters: {
        type: 'object',
        properties: {
          presentationId: { type: 'string', description: 'The presentation ID' },
          title: { type: 'string', description: 'Slide title' },
          body: { type: 'string', description: 'Optional slide body text' }
        },
        required: ['presentationId', 'title']
      }
    },
    async execute(args, signal) {
      return runGoogleTool(async () => {
        const presentationId = String(args.presentationId ?? '')
        const slideId = `kira-slide-${Date.now()}`
        const titleId = `${slideId}-title`
        const bodyId = `${slideId}-body`

        const requests: unknown[] = [
          {
            createSlide: {
              objectId: slideId,
              slideLayoutReference: { predefinedLayout: 'TITLE_AND_BODY' },
              placeholderIdMappings: [
                { layoutPlaceholder: { type: 'TITLE' }, objectId: titleId },
                { layoutPlaceholder: { type: 'BODY' }, objectId: bodyId }
              ]
            }
          },
          { insertText: { objectId: titleId, text: String(args.title ?? '') } }
        ]
        if (args.body) requests.push({ insertText: { objectId: bodyId, text: String(args.body) } })

        await googleFetchJson(
          `${SLIDES_BASE}/${presentationId}:batchUpdate`,
          auth,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ requests }) },
          signal
        )
        return 'Slide added.'
      })
    }
  }

  return [readSlidesOutlineTool, createSlideTool]
}
