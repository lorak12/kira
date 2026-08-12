export interface TranscriptResult {
  text: string
  lang: string
}

export interface SttEngine {
  transcribe(wavBuffer: Buffer, signal?: AbortSignal): Promise<TranscriptResult>
}
