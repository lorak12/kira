// One entry per TTS model/voice combo under test. Each `synthesize(text)`
// returns { buffer, ext } and throws on failure -- the runner catches per
// (text, provider) so one bad key/model doesn't kill the whole sweep.

function requireKey(name) {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : null
}

async function elevenLabsSynthesize(model) {
  return async (text) => {
    const apiKey = requireKey('ELEVENLABS_API_KEY')
    const voiceId = process.env.ELEVENLABS_VOICE_ID || 'jqcCZkN6Knx8BJ5TBdYR' // Kira's configured voice
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: model })
    })
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
    return { buffer: Buffer.from(await res.arrayBuffer()), ext: 'mp3' }
  }
}

async function edgeSynthesize(voiceName) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts')
  return async (text) => {
    const tts = new MsEdgeTTS()
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3)
    const { audioStream } = tts.toStream(text)
    const chunks = []
    for await (const chunk of audioStream) chunks.push(chunk)
    tts.close()
    return { buffer: Buffer.concat(chunks), ext: 'mp3' }
  }
}

async function openAiSynthesize(model, voice) {
  return async (text) => {
    const apiKey = requireKey('OPENAI_API_KEY')
    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, voice, input: text, response_format: 'mp3' })
    })
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
    return { buffer: Buffer.from(await res.arrayBuffer()), ext: 'mp3' }
  }
}

export const providers = [
  {
    id: 'elevenlabs-multilingual-v2',
    label: 'ElevenLabs: eleven_multilingual_v2 (current Kira default)',
    enabled: () => Boolean(requireKey('ELEVENLABS_API_KEY')),
    synthesize: await elevenLabsSynthesize('eleven_multilingual_v2')
  },
  {
    id: 'elevenlabs-flash-v2_5',
    label: 'ElevenLabs: eleven_flash_v2_5 (low-latency)',
    enabled: () => Boolean(requireKey('ELEVENLABS_API_KEY')),
    synthesize: await elevenLabsSynthesize('eleven_flash_v2_5')
  },
  {
    id: 'elevenlabs-v3',
    label: 'ElevenLabs: eleven_v3 (most expressive, not real-time)',
    enabled: () => Boolean(requireKey('ELEVENLABS_API_KEY')),
    synthesize: await elevenLabsSynthesize('eleven_v3')
  },
  {
    id: 'edge-zofia',
    label: 'Edge: pl-PL-ZofiaNeural (current Kira default, free)',
    enabled: () => true,
    synthesize: await edgeSynthesize('pl-PL-ZofiaNeural')
  },
  {
    id: 'edge-marek',
    label: 'Edge: pl-PL-MarekNeural (free)',
    enabled: () => true,
    synthesize: await edgeSynthesize('pl-PL-MarekNeural')
  },
  {
    id: 'openai-tts-1',
    label: 'OpenAI: tts-1',
    enabled: () => Boolean(requireKey('OPENAI_API_KEY')),
    synthesize: await openAiSynthesize('tts-1', 'alloy')
  },
  {
    id: 'openai-gpt-4o-mini-tts',
    label: 'OpenAI: gpt-4o-mini-tts',
    enabled: () => Boolean(requireKey('OPENAI_API_KEY')),
    synthesize: await openAiSynthesize('gpt-4o-mini-tts', 'alloy')
  }
]
