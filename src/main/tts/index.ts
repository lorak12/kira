import type { KiraConfig } from '../config/schema'
import type { TtsEngine } from './TtsEngine'
import { ElevenLabsEngine } from './elevenLabsClient'
import { EdgeTtsEngine } from './edgeTtsClient'

export function createTtsEngine(config: KiraConfig): TtsEngine {
  return config.tts.engine === 'edge' ? new EdgeTtsEngine(config) : new ElevenLabsEngine(config)
}
