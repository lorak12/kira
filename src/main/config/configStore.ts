import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { configSchema, type KiraConfig } from './schema'

let cachedConfig: KiraConfig | null = null

/**
 * Resolves a user-editable file that lives either next to the project (dev
 * convenience -- edit-and-restart without touching userData) or in Electron's
 * userData dir (packaged installs). Dev cwd wins if the file exists there.
 * Shared by configPath() and personaPath() -- same resolution rule, different
 * filename.
 */
export function resolveUserFile(filename: string): string {
  const devPath = join(process.cwd(), filename)
  if (existsSync(devPath)) return devPath
  return join(app.getPath('userData'), filename)
}

/** Where kira.config.json actually lives -- exported so a tool can offer to open it (see tools/settings.ts). */
export function configPath(): string {
  return resolveUserFile('kira.config.json')
}

/** Where kira.persona.md actually lives -- see llm/personaFile.ts. */
export function personaPath(): string {
  return resolveUserFile('kira.persona.md')
}

export function loadConfig(): KiraConfig {
  if (cachedConfig) return cachedConfig

  const path = configPath()
  if (!existsSync(path)) {
    throw new Error(
      `Kira config not found at ${path}. Copy kira.config.example.json to kira.config.json and fill in your API keys.`
    )
  }

  const raw = JSON.parse(readFileSync(path, 'utf-8'))
  const result = configSchema.safeParse(raw)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid kira.config.json:\n${issues}`)
  }

  cachedConfig = result.data
  return cachedConfig
}
