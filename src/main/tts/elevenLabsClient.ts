import type { KiraConfig } from '../config/schema'
import type { TtsEngine } from './TtsEngine'

export class ElevenLabsEngine implements TtsEngine {
  constructor(private config: KiraConfig) {}

  async synthesize(text: string, _lang: string, signal?: AbortSignal): Promise<Buffer> {
    const { elevenLabsApiKey, voiceId, model, voiceSettings } = this.config.tts
    if (!elevenLabsApiKey || !voiceId) {
      throw new Error('tts.engine is "elevenlabs" but tts.elevenLabsApiKey / tts.voiceId are not set')
    }
    // Optional voice_settings tuning (assistant.tts.voiceSettings) -- any
    // field left unset falls back to ElevenLabs' own default for it, same
    // as omitting voice_settings entirely.
    const body: Record<string, unknown> = { text, model_id: model }
    if (voiceSettings) {
      body.voice_settings = {
        stability: voiceSettings.stability,
        similarity_boost: voiceSettings.similarityBoost,
        speed: voiceSettings.speed
      }
    }
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal
    })

    if (!response.ok) {
      throw new Error(`ElevenLabs TTS request failed: ${response.status} ${await response.text()}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    return Buffer.from(arrayBuffer)
  }
}
