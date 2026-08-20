import { GoogleAuthError } from '../google/authManager'

/**
 * Shared execute()-body wrapper for every Google tool -- catches
 * GoogleAuthError (not linked / no client creds) and any other thrown error,
 * turning both into a spoken-friendly string instead of letting them escape
 * (every ToolDefinition.execute() must never throw, per tools/types.ts).
 */
export async function runGoogleTool(fn: () => Promise<string>): Promise<string> {
  try {
    return await fn()
  } catch (err) {
    if (err instanceof GoogleAuthError) return err.message
    return `Couldn't do that: ${(err as Error).message}`
  }
}
