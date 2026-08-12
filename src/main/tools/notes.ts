import { app } from 'electron'
import { appendFile, mkdir, readFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { ToolDefinition } from './types'

const DEFAULT_LIST_LIMIT = 5

export function getNotesPath(): string {
  return join(app.getPath('userData'), 'notes.md')
}

/** Formats a note line as stored on disk. Pure/testable. */
export function formatNoteLine(content: string, now: Date = new Date()): string {
  return `- [${now.toISOString()}] ${content}`
}

/** Strips the "- [timestamp] " prefix back off for spoken output. Pure/testable. */
export function stripNotePrefix(line: string): string {
  return line.replace(/^- \[[^\]]*\]\s*/, '')
}

export async function appendNote(content: string, now: Date = new Date()): Promise<void> {
  const path = getNotesPath()
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, `${formatNoteLine(content, now)}\n`, 'utf-8')
}

export async function readNoteLines(): Promise<string[]> {
  try {
    const raw = await readFile(getNotesPath(), 'utf-8')
    return raw.split('\n').filter((l) => l.trim().length > 0)
  } catch {
    return []
  }
}

/**
 * Formats the most recent notes as a system-context blurb for a fresh
 * session, or null if there are none -- this is how Kira "remembers"
 * things across sessions without the user having to explicitly ask
 * list_notes every time. See index.ts's wake handler, which pushes this
 * into `history` right after greeting so it's available for the rest of
 * the conversation.
 */
export async function buildRecentNotesContext(limit = DEFAULT_LIST_LIMIT): Promise<string | null> {
  const lines = await readNoteLines()
  if (!lines.length) return null
  const recent = lines.slice(-limit).reverse().map(stripNotePrefix)
  return `The user's ${recent.length} most recently saved note(s), for background context -- only bring one up if it's actually relevant to what's being discussed, don't recite the list unprompted: ${recent.join('; ')}.`
}

export const addNoteTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'add_note',
    description: 'Saves a short note/reminder to a persistent notes file for later.',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'The note content to save' }
      },
      required: ['content']
    }
  },
  async execute(args) {
    const content = String(args.content ?? '').trim()
    if (!content) return 'Please tell me what to note down.'
    try {
      await appendNote(content)
      return 'Noted.'
    } catch (err) {
      return `Couldn't save that note: ${(err as Error).message}`
    }
  }
}

export const listNotesTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'list_notes',
    description: 'Lists the most recently saved notes.',
    parameters: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max number of recent notes to return (default 5)' }
      },
      required: []
    }
  },
  async execute(args) {
    const limit = Number.isFinite(Number(args.limit)) && Number(args.limit) > 0 ? Number(args.limit) : DEFAULT_LIST_LIMIT
    const lines = await readNoteLines()
    if (!lines.length) return "You don't have any notes saved."
    const recent = lines.slice(-limit).reverse().map(stripNotePrefix)
    return `Your ${recent.length} most recent note(s): ${recent.join('; ')}.`
  }
}
