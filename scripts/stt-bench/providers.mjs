// One entry per STT model under test. Each `transcribe(buffer, opts)` returns
// { text } and throws on failure -- the runner catches per-(clip,provider)
// so one bad key/model doesn't kill the whole sweep.
//
// `enabled` is computed from which API keys are present in the environment
// (see .env.example) so you only pay for/hit providers you've configured.

function requireKey(name) {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : null
}

async function openAiCompatibleTranscribe({ url, apiKey, buffer, filename, model, language, extraFields }) {
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: 'audio/wav' }), filename)
  form.append('model', model)
  if (language) form.append('language', language)
  for (const [k, v] of Object.entries(extraFields ?? {})) form.append(k, v)

  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const data = await res.json()
  return { text: (data.text ?? '').trim() }
}

async function groqTranscribe(model) {
  return async (buffer, filename, { language } = {}) => {
    const apiKey = requireKey('GROQ_API_KEY')
    return openAiCompatibleTranscribe({
      url: 'https://api.groq.com/openai/v1/audio/transcriptions',
      apiKey,
      buffer,
      filename,
      model,
      language
    })
  }
}

async function openAiTranscribe(model) {
  return async (buffer, filename, { language } = {}) => {
    const apiKey = requireKey('OPENAI_API_KEY')
    return openAiCompatibleTranscribe({
      url: 'https://api.openai.com/v1/audio/transcriptions',
      apiKey,
      buffer,
      filename,
      model,
      language
    })
  }
}

async function deepgramTranscribe(buffer, filename, { language, model = 'nova-3' } = {}) {
  const apiKey = requireKey('DEEPGRAM_API_KEY')
  const params = new URLSearchParams({ model, smart_format: 'true', punctuate: 'true' })
  if (language) params.set('language', language)
  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: 'POST',
    headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'audio/wav' },
    body: buffer
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const data = await res.json()
  const text = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? ''
  return { text: text.trim() }
}

async function elevenLabsScribeTranscribe(buffer, filename, { language } = {}) {
  const apiKey = requireKey('ELEVENLABS_API_KEY')
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: 'audio/wav' }), filename)
  form.append('model_id', 'scribe_v1')
  if (language) form.append('language_code', language)
  const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: form
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const data = await res.json()
  return { text: (data.text ?? '').trim() }
}

async function assemblyAiTranscribe(buffer, filename, { language } = {}) {
  const apiKey = requireKey('ASSEMBLYAI_API_KEY')
  const headers = { authorization: apiKey }

  const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers,
    body: buffer
  })
  if (!uploadRes.ok) throw new Error(`upload ${uploadRes.status} ${await uploadRes.text()}`)
  const { upload_url } = await uploadRes.json()

  const createRes = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      audio_url: upload_url,
      speech_model: 'best',
      language_code: language || undefined,
      language_detection: !language
    })
  })
  if (!createRes.ok) throw new Error(`create ${createRes.status} ${await createRes.text()}`)
  const { id } = await createRes.json()

  // Poll -- AssemblyAI transcription is async, typically a few seconds.
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500))
    const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, { headers })
    const data = await pollRes.json()
    if (data.status === 'completed') return { text: (data.text ?? '').trim() }
    if (data.status === 'error') throw new Error(data.error)
  }
  throw new Error('timed out waiting for AssemblyAI transcript')
}

export const providers = [
  {
    id: 'groq-whisper-large-v3',
    label: 'Groq: whisper-large-v3',
    enabled: () => Boolean(requireKey('GROQ_API_KEY')),
    transcribe: await groqTranscribe('whisper-large-v3')
  },
  {
    id: 'groq-whisper-large-v3-turbo',
    label: 'Groq: whisper-large-v3-turbo',
    enabled: () => Boolean(requireKey('GROQ_API_KEY')),
    transcribe: await groqTranscribe('whisper-large-v3-turbo')
  },
  {
    id: 'openai-whisper-1',
    label: 'OpenAI: whisper-1',
    enabled: () => Boolean(requireKey('OPENAI_API_KEY')),
    transcribe: await openAiTranscribe('whisper-1')
  },
  {
    id: 'openai-gpt-4o-transcribe',
    label: 'OpenAI: gpt-4o-transcribe',
    enabled: () => Boolean(requireKey('OPENAI_API_KEY')),
    transcribe: await openAiTranscribe('gpt-4o-transcribe')
  },
  {
    id: 'openai-gpt-4o-mini-transcribe',
    label: 'OpenAI: gpt-4o-mini-transcribe',
    enabled: () => Boolean(requireKey('OPENAI_API_KEY')),
    transcribe: await openAiTranscribe('gpt-4o-mini-transcribe')
  },
  {
    id: 'deepgram-nova-3',
    label: 'Deepgram: nova-3',
    enabled: () => Boolean(requireKey('DEEPGRAM_API_KEY')),
    transcribe: deepgramTranscribe
  },
  {
    id: 'elevenlabs-scribe-v1',
    label: 'ElevenLabs: scribe_v1',
    enabled: () => Boolean(requireKey('ELEVENLABS_API_KEY')),
    transcribe: elevenLabsScribeTranscribe
  },
  {
    id: 'assemblyai-best',
    label: 'AssemblyAI: best (Universal)',
    enabled: () => Boolean(requireKey('ASSEMBLYAI_API_KEY')),
    transcribe: assemblyAiTranscribe
  }
]
