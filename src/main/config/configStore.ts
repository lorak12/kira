import { app } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { configSchema, type KiraConfig } from './schema'

let cachedConfig: KiraConfig | null = null

/** Where kira.config.json actually lives -- exported so a tool can offer to open it (see tools/settings.ts). */
export function configPath(): string {
  const devPath = join(process.cwd(), 'kira.config.json')
  if (existsSync(devPath)) return devPath
  return join(app.getPath('userData'), 'kira.config.json')
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
