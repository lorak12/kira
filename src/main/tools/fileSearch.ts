import { shell } from 'electron'
import { readdir } from 'fs/promises'
import { homedir } from 'os'
import { join, basename } from 'path'
import type { ToolDefinition } from './types'

const SEARCH_DIRS = ['Desktop', 'Documents', 'Downloads'].map((d) => join(homedir(), d))
const MAX_RESULTS = 8

async function listFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true })
    return entries
      .filter((e) => e.isFile())
      .map((e) => join(e.parentPath ?? (e as unknown as { path: string }).path, e.name))
  } catch {
    return []
  }
}

/** Fuzzy-scores a candidate filename against a query. Higher is better; 0 means no match. */
export function scoreFileMatch(query: string, filename: string): number {
  const q = query.toLowerCase().trim()
  const name = basename(filename).toLowerCase()
  if (!q) return 0
  if (name === q) return 100
  if (name.startsWith(q)) return 80
  if (name.includes(q)) return 60
  return 0
}

/** Ranks candidate file paths by relevance to a query, best first, capped to maxResults. Pure/testable. */
export function rankFiles(query: string, candidates: string[], maxResults = MAX_RESULTS): string[] {
  return candidates
    .map((path) => ({ path, score: scoreFileMatch(query, path) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map((c) => c.path)
}

export const findFilesTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'find_files',
    description:
      "Searches the user's Desktop, Documents, and Downloads folders for files by NAME only -- it does not look at file contents and can't tell you what's in a file or what a project is about. Returns matching file paths -- use open_file to open one, or read_file to get its actual contents. Do not use this as a way to \"research\" or \"understand\" a project; if a file's content matters, find it first, then read_file it or ask the user.",
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Filename or partial filename to search for' }
      },
      required: ['query']
    }
  },
  async execute(args) {
    const query = String(args.query ?? '')
    if (!query.trim()) return 'Please give me something to search for.'
    const lists = await Promise.all(SEARCH_DIRS.map(listFiles))
    const matches = rankFiles(query, lists.flat())
    if (!matches.length) return `No files found matching "${query}".`
    return `Found ${matches.length} file(s): ${matches.map((m) => basename(m)).join(', ')}.`
  }
}

export const openFileTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'open_file',
    description: 'Opens a file by its full path (e.g. one returned by find_files) with its default application.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Full path to the file to open' }
      },
      required: ['path']
    }
  },
  async execute(args) {
    const path = String(args.path ?? '')
    if (!path) return 'No file path given.'
    const err = await shell.openPath(path)
    if (err) return `Couldn't open that file: ${err}`
    return `Opened ${basename(path)}.`
  }
}
