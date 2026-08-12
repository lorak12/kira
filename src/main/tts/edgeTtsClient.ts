import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'
import type { KiraConfig } from '../config/schema'
import type { TtsEngine } from './TtsEngine'

/**
 * Free TTS fallback via Microsoft Edge's neural voices (no API key). Used
 * until/unless an ElevenLabs paid plan is available -- same TtsEngine
 * interface, so switching back is a one-line config change.
 */
export class EdgeTtsEngine implements TtsEngine {
  constructor(private config: KiraConfig) {}

  async synthesize(text: string, lang: string): Promise<Buffer> {
    const voices = this.config.tts.edge.voices
    const voiceName = voices[lang] ?? voices.default
    // Optional SSML prosody tuning (assistant.tts.edge.prosody) -- rate/
    // pitch/volume left unset just use msedge-tts's own defaults.
    const prosody = this.config.tts.edge.prosody

    const tts = new MsEdgeTTS()
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
    const { audioStream } = tts.toStream(text, prosody)

    const chunks: Buffer[] = []
    for await (const chunk of audioStream) {
      chunks.push(chunk as Buffer)
    }
    tts.close()
    return Buffer.concat(chunks)
  }
}
