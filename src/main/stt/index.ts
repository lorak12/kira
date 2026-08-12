import type { KiraConfig } from '../config/schema'
import type { SttEngine } from './SttEngine'
import { GroqWhisperEngine } from './groqWhisperEngine'

/**
 * Only relevant for stt.engine === 'groq' -- the 'local-whisper' path
 * transcribes inside the Python sidecar directly, since it already owns the
 * mic and audio buffer.
 */
export function createSttEngine(config: KiraConfig): SttEngine | null {
  if (config.stt.engine !== 'groq') return null
  const apiKey = config.stt.groq?.apiKey
  if (!apiKey) {
    throw new Error('stt.engine is "groq" but stt.groq.apiKey is not set in kira.config.json')
  }
  return new GroqWhisperEngine(apiKey, config.stt.language)
}
