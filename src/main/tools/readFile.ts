import { readFile as fsReadFile, stat } from 'fs/promises'
import type { ToolDefinition } from './types'

const MAX_CONTENT_CHARS = 4000
// Above this, don't even try -- this tool is for "what does this note/log/
// config say", not for dumping a large file into the LLM's context.
const MAX_FILE_BYTES = 2 * 1024 * 1024

/** Caps file content for a spoken/LLM-context-friendly size. Pure/testable. */
export function truncateFileContent(text: string, max = MAX_CONTENT_CHARS): string {
  const trimmed = text.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

export const readFileTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'read_file',
    description:
      "Reads a local TEXT file's actual contents by its FULL path (e.g. one returned by find_files) -- plain text, markdown, JSON, CSV, code, logs, and similar. NOT for PDFs, Word docs, images, or other binary formats. Use this to answer questions about or summarize what's actually in a file; use open_file instead when the user just wants it opened in its own app to look at themselves. A project name (e.g. \"jarvis\") is NOT a path -- if the file is inside one of the user's configured dev projects, call open_project with action \"path\" first to get its real filesystem path, then join it with the filename.",
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Full path to the text file to read' }
      },
      required: ['path']
    }
  },
  async execute(args) {
    const path = String(args.path ?? '')
    if (!path) return 'No file path given.'
    try {
      const stats = await stat(path)
      if (stats.isDirectory()) return `"${path}" is a folder, not a file.`
      if (stats.size > MAX_FILE_BYTES) {
        return `That file's too large to read directly (${Math.round(stats.size / 1024)} KB) -- try open_file instead.`
      }
      const content = await fsReadFile(path, 'utf-8')
      const text = truncateFileContent(content)
      return text || 'That file is empty.'
    } catch (err) {
      return `Couldn't read that file: ${(err as Error).message}`
    }
  }
}
