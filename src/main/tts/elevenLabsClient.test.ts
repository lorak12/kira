import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ElevenLabsEngine } from './elevenLabsClient'
import type { KiraConfig } from '../config/schema'

function configWith(tts: Partial<KiraConfig['tts']>): KiraConfig {
  return {
    tts: {
      elevenLabsApiKey: 'key',
      voiceId: 'voice-1',
      model: 'eleven_multilingual_v2',
      ...tts
    }
  } as unknown as KiraConfig
}

function mockFetchOk(): ReturnType<typeof vi.fn> {
  const mock = vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(4)
  }))
  vi.stubGlobal('fetch', mock)
  return mock
}

beforeEach(() => {
  vi.unstubAllGlobals()
})

describe('ElevenLabsEngine.synthesize', () => {
  it('throws a clear error when the API key or voice id is missing', async () => {
    const engine = new ElevenLabsEngine(configWith({ elevenLabsApiKey: undefined }))
    await expect(engine.synthesize('hi', 'en')).rejects.toThrow(/elevenLabsApiKey.*voiceId/)
  })

  it('sends no voice_settings when none are configured', async () => {
    const fetchMock = mockFetchOk()
    const engine = new ElevenLabsEngine(configWith({}))
    await engine.synthesize('hi', 'en')
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.voice_settings).toBeUndefined()
    expect(body.text).toBe('hi')
  })

  it('sends configured voice_settings, translated to the API\'s field names', async () => {
    const fetchMock = mockFetchOk()
    const engine = new ElevenLabsEngine(
      configWith({ voiceSettings: { stability: 0.4, similarityBoost: 0.8, speed: 1.1 } })
    )
    await engine.synthesize('hi', 'en')
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.voice_settings).toEqual({ stability: 0.4, similarity_boost: 0.8, speed: 1.1 })
  })

  it('throws with the response body on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, text: async () => 'server error' }))
    )
    const engine = new ElevenLabsEngine(configWith({}))
    await expect(engine.synthesize('hi', 'en')).rejects.toThrow(/500/)
  })
})
