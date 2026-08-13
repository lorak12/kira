import { readFileSync, existsSync } from 'node:fs'

function parseEnvFile(path) {
  const out = {}
  if (!existsSync(path)) return out
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

// Loads scripts/tts-bench/.env, then falls back to scripts/stt-bench/.env for
// any key not set there (ELEVENLABS_API_KEY/OPENAI_API_KEY are shared across
// both benches -- no need to keep two copies in sync).
export function loadEnv(primaryPath, fallbackPath) {
  const primary = parseEnvFile(primaryPath)
  const fallback = fallbackPath ? parseEnvFile(fallbackPath) : {}
  for (const [key, value] of Object.entries({ ...fallback, ...primary })) {
    if (!(key in process.env)) process.env[key] = value
  }
}
