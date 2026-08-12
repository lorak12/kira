import { describe, it, expect, vi } from 'vitest'
import { EdgeTtsEngine } from './edgeTtsClient'
import type { KiraConfig } from '../config/schema'

const setMetadata = vi.fn(async () => undefined)
const toStream = vi.fn(() => ({ audioStream: (async function* (): AsyncGenerator<Buffer> {})() }))
const close = vi.fn()

vi.mock('msedge-tts', () => ({
  MsEdgeTTS: vi.fn().mockImplementation(function MockMsEdgeTTS(this: unknown) {
    return { setMetadata, toStream, close }
  }),
  OUTPUT_FORMAT: { AUDIO_24KHZ_96KBITRATE_MONO_MP3: 'audio-24khz-96kbitrate-mono-mp3' }
}))

function configWith(edge: Partial<KiraConfig['tts']['edge']>): KiraConfig {
  return {
    tts: {
      edge: {
        voices: { en: 'en-US-JennyNeural', default: 'en-US-JennyNeural' },
        ...edge
      }
    }
  } as unknown as KiraConfig
}

describe('EdgeTtsEngine.synthesize', () => {
  it('picks the voice for the detected language, falling back to default', async () => {
    const engine = new EdgeTtsEngine(configWith({}))
    await engine.synthesize('hello', 'en')
    expect(setMetadata).toHaveBeenCalledWith('en-US-JennyNeural', expect.any(String))

    await engine.synthesize('hello', 'de')
    expect(setMetadata).toHaveBeenCalledWith('en-US-JennyNeural', expect.any(String))
  })

  it('passes no prosody options through when none are configured', async () => {
    const engine = new EdgeTtsEngine(configWith({}))
    await engine.synthesize('hello', 'en')
    expect(toStream).toHaveBeenCalledWith('hello', undefined)
  })

  it('forwards configured rate/pitch/volume prosody to toStream', async () => {
    const engine = new EdgeTtsEngine(configWith({ prosody: { rate: '+20%', pitch: '+2st', volume: 80 } }))
    await engine.synthesize('hello', 'en')
    expect(toStream).toHaveBeenCalledWith('hello', { rate: '+20%', pitch: '+2st', volume: 80 })
  })
})
