import { shell } from 'electron'
import { readdir } from 'fs/promises'
import { join, basename, extname } from 'path'
import type { ToolDefinition } from './types'

const NOISE_WORDS = ['uninstall', 'read me', 'readme', 'help', 'license', 'documentation', 'website']

async function listShortcuts(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { recursive: true, withFileTypes: true })
    return entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.lnk'))
      .map((e) => join(e.parentPath ?? (e as unknown as { path: string }).path, e.name))
  } catch {
    return []
  }
}

async function findAppShortcuts(): Promise<string[]> {
  const dirs = [
    join(process.env.APPDATA ?? '', 'Microsoft/Windows/Start Menu/Programs'),
    join(process.env.ProgramData ?? '', 'Microsoft/Windows/Start Menu/Programs')
  ]
  const results = await Promise.all(dirs.map(listShortcuts))
  return results.flat()
}

export function scoreMatch(query: string, candidate: string): number {
  const q = query.toLowerCase().trim()
  const c = candidate.toLowerCase().trim()
  if (c === q) return 100
  if (c.startsWith(q)) return 80
  if (c.includes(q)) return 60
  return 0
}

/**
 * Finds an installed app by fuzzy-matching its Start Menu shortcut name --
 * no hardcoded per-app paths, works with whatever's actually installed.
 */
export async function findBestAppMatch(appName: string): Promise<string | null> {
  const shortcuts = await findAppShortcuts()
  let best: { path: string; score: number } | null = null

  for (const path of shortcuts) {
    const name = basename(path, extname(path))
    const isNoise = NOISE_WORDS.some((w) => name.toLowerCase().includes(w))
    let score = scoreMatch(appName, name)
    if (isNoise) score -= 30
    if (score > 0 && (!best || score > best.score)) {
      best = { path, score }
    }
  }

  return best?.path ?? null
}

export const openAppTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'open_app',
    description:
      "Opens an installed application by name (e.g. 'Spotify', 'Discord', 'Steam'). Searches the user's actual installed Start Menu shortcuts, so use the app's common name, not a file path.",
    parameters: {
      type: 'object',
      properties: {
        appName: { type: 'string', description: 'The name of the application to open' }
      },
      required: ['appName']
    }
  },
  async execute(args) {
    const appName = String(args.appName ?? '')
    const match = await findBestAppMatch(appName)
    if (!match) {
      return `Could not find an installed application matching "${appName}".`
    }
    await shell.openPath(match)
    return `Opened ${basename(match, extname(match))}.`
  }
}
