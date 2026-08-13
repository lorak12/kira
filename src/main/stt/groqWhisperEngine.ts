import type { SttEngine, TranscriptResult } from './SttEngine'

/**
 * Fallback STT path: the Python sidecar hands back raw utterance audio
 * (rather than transcribing locally) when stt.engine is 'groq', and this
 * engine sends it to Groq's hosted whisper-large-v3 for transcription.
 */
export class GroqWhisperEngine implements SttEngine {
  constructor(
    private apiKey: string,
    private language?: string,
    private model: string = 'whisper-large-v3-turbo'
  ) {}

  async transcribe(wavBuffer: Buffer, signal?: AbortSignal): Promise<TranscriptResult> {
    const form = new FormData()
    form.append('file', new Blob([new Uint8Array(wavBuffer)], { type: 'audio/wav' }), 'utterance.wav')
    form.append('model', this.model)
    if (this.language) form.append('language', this.language)

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
      signal
    })

    if (!response.ok) {
      throw new Error(`Groq STT request failed: ${response.status} ${await response.text()}`)
    }

    const data = (await response.json()) as { text: string; language?: string }
    return { text: data.text.trim(), lang: data.language ?? 'unknown' }
  }
}
