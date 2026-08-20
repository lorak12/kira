import type { ToolDefinition } from './types'
import type { GoogleAuthManager } from '../google/authManager'
import { googleFetchJson } from '../google/http'
import { runGoogleTool } from './googleErrors'

const DRIVE_BASE = 'https://www.googleapis.com/drive/v3/files'

interface DriveFile {
  id: string
  name: string
  mimeType?: string
  webViewLink?: string
}

interface DriveFileList {
  files?: DriveFile[]
}

export function createGoogleDriveTools(auth: GoogleAuthManager): ToolDefinition[] {
  const searchDriveFilesTool: ToolDefinition = {
    risky: false,
    schema: {
      name: 'search_drive_files',
      description: "Searches the user's Google Drive by file name/content.",
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Text to search for in file names' },
          maxResults: { type: 'number', description: 'Max results (default 10)' }
        },
        required: ['query']
      }
    },
    async execute(args, signal) {
      return runGoogleTool(async () => {
        const params = new URLSearchParams({
          q: `name contains '${String(args.query ?? '').replace(/'/g, "\\'")}'`,
          fields: 'files(id,name,mimeType,webViewLink)',
          pageSize: String(Number.isFinite(Number(args.maxResults)) ? Number(args.maxResults) : 10)
        })
        const result = await googleFetchJson<DriveFileList>(`${DRIVE_BASE}?${params}`, auth, undefined, signal)
        const files = result.files ?? []
        if (!files.length) return 'No matching files found in Drive.'
        return `Found: ${files.map((f) => `"${f.name}" (id: ${f.id})`).join('; ')}.`
      })
    }
  }

  const getDriveFileLinkTool: ToolDefinition = {
    risky: false,
    schema: {
      name: 'get_drive_file_link',
      // "offers to open it" -- once you have the link, use the existing
      // open_url tool to actually open it rather than a dedicated one here.
      description: 'Gets the shareable web link for a Drive file by its ID (from search_drive_files). Follow up with open_url if the user wants it opened.',
      parameters: {
        type: 'object',
        properties: {
          fileId: { type: 'string', description: 'The Drive file ID' }
        },
        required: ['fileId']
      }
    },
    async execute(args, signal) {
      return runGoogleTool(async () => {
        const file = await googleFetchJson<DriveFile>(
          `${DRIVE_BASE}/${encodeURIComponent(String(args.fileId ?? ''))}?fields=id,name,webViewLink`,
          auth,
          undefined,
          signal
        )
        if (!file.webViewLink) return `"${file.name}" doesn't have a shareable link available.`
        return `Link to "${file.name}": ${file.webViewLink}`
      })
    }
  }

  return [searchDriveFilesTool, getDriveFileLinkTool]
}
