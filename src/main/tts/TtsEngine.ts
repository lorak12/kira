export interface TtsEngine {
  synthesize(text: string, lang: string, signal?: AbortSignal): Promise<Buffer>
}
