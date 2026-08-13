import { z } from 'zod'

export const configSchema = z.object({
  wakeWord: z.object({
    // Path to a trained openWakeWord model (.onnx or .tflite) for "Kira".
    // Train for free via https://colab.research.google.com/github/dscripka/openWakeWord
    modelPath: z.string().min(1, 'wakeWord.modelPath is required'),
    muteModelPath: z.string().optional(),
    threshold: z.number().min(0).max(1).default(0.5)
  }),
  sidecar: z.object({
    // Port for the local WebSocket the Python audio sidecar exposes to the
    // Electron main process (wake-word detection + STT run in that process).
    port: z.number().default(8765),
    pythonPath: z.string().default('python')
  }),
  // Real barge-in -- interrupting Kira by just talking over her, rather than
  // needing the mute keyword/hotkey or a fresh wake word. Off by default:
  // without acoustic echo cancellation, a live mic will pick up Kira's own
  // TTS coming out of the speakers and can false-trigger on her own words
  // (worse the louder/closer the output). Only turn this on if you're on a
  // headset mic that's physically isolated from playback, and expect to
  // tune rmsThreshold/minSpeechMs by ear afterward -- see TODO-barge-in.md
  // for the full reasoning.
  bargeIn: z
    .object({
      enabled: z.boolean().default(false),
      // int16 RMS a chunk must exceed to count as "real speech" while Kira
      // is talking -- deliberately higher than the SILENCE_RMS_THRESHOLD
      // (300) used for ordinary end-of-utterance silence detection, since
      // this has to stay quiet through Kira's own voice bleeding into the
      // mic, not just background noise.
      rmsThreshold: z.number().min(0).default(1200),
      // How much continuous above-threshold audio is required before it
      // counts as an interruption rather than a cough/click/stray noise.
      minSpeechMs: z.number().int().min(0).default(400)
    })
    .default({ enabled: false, rmsThreshold: 1200, minSpeechMs: 400 }),
  stt: z.object({
    engine: z.enum(['local-whisper', 'groq']).default('local-whisper'),
    // Pins Whisper's transcription language instead of auto-detecting it per
    // utterance -- auto-detect is unreliable on short commands and drifts
    // further under background audio bleed. Leave unset to keep auto-detect.
    language: z.string().optional(),
    localWhisper: z
      .object({
        modelSize: z.enum(['small', 'medium', 'large-v3']).default('small')
      })
      .default({ modelSize: 'small' }),
    groq: z
      .object({
        apiKey: z.string().optional(),
        // turbo is ~2x faster than large-v3 with no visible accuracy loss on
        // short commands in testing (see scripts/stt-bench/) -- large-v3
        // stays selectable for anyone who wants the marginally more
        // conservative model.
        model: z.enum(['whisper-large-v3', 'whisper-large-v3-turbo']).default('whisper-large-v3-turbo')
      })
      .optional()
  }),
  llm: z.object({
    openRouterApiKey: z.string().min(1, 'llm.openRouterApiKey is required'),
    model: z.string().default('deepseek/deepseek-v4-flash'),
    fallbackModel: z.string().default('google/gemini-3.1-flash-lite')
  }),
  tts: z.object({
    engine: z.enum(['elevenlabs', 'edge']).default('elevenlabs'),
    elevenLabsApiKey: z.string().optional(),
    voiceId: z.string().optional(),
    model: z.string().default('eleven_multilingual_v2'),
    // Optional ElevenLabs voice_settings tuning -- any field left out uses
    // ElevenLabs' own default for it. See
    // https://elevenlabs.io/docs/api-reference/text-to-speech/convert
    voiceSettings: z
      .object({
        stability: z.number().min(0).max(1).optional(),
        similarityBoost: z.number().min(0).max(1).optional(),
        speed: z.number().min(0.5).max(2).optional()
      })
      .optional(),
    edge: z
      .object({
        // Voice per detected language code (falls back to `default` for
        // anything not listed). Full voice list: `edge-tts --list-voices`.
        voices: z.record(z.string(), z.string()).default({
          pl: 'pl-PL-ZofiaNeural',
          en: 'en-US-JennyNeural',
          default: 'en-US-JennyNeural'
        }),
        // SSML prosody tuning for the free Edge engine. rate/pitch/volume
        // each accept a named level ("slow", "high", "loud", ...) or a
        // relative percentage string ("+20%", "-10%"). Left out -> Edge's
        // own default for that property. See msedge-tts's Prosody.d.ts for
        // the named levels, or the SSML docs it links for the full syntax.
        prosody: z
          .object({
            rate: z.union([z.string(), z.number()]).optional(),
            // Pitch is string-only in msedge-tts's ProsodyOptions (named
            // level or a relative value like "+10%"/"+2st") -- unlike
            // rate/volume, it has no plain-number form.
            pitch: z.string().optional(),
            volume: z.union([z.string(), z.number()]).optional()
          })
          .optional()
      })
      .default({ voices: { pl: 'pl-PL-ZofiaNeural', en: 'en-US-JennyNeural', default: 'en-US-JennyNeural' } })
  }),
  overlay: z.object({
    style: z.enum(['full', 'minimal']).default('full'),
    accentColor: z.string().default('#8b5cf6')
  }),
  hotkeys: z.object({
    mute: z.string().default('CommandOrControl+Shift+M'),
    // Ends the conversation session and hides the overlay. (Ctrl+Escape is
    // reserved by Windows for the Start Menu and isn't interceptable, hence
    // this default instead.)
    dismiss: z.string().default('Control+Alt+K')
  }),
  assistant: z
    .object({
      // Language used for the spoken greeting on wake, before any speech has
      // been heard yet to detect a language from. Updated implicitly each
      // session by whatever language the user actually speaks.
      defaultLanguage: z.enum(['en', 'pl']).default('en'),
      // Personality tuning folded into the system prompt -- see
      // llm/personaPrompt.ts. Doesn't change *what* she can do, just how she
      // talks about it.
      wit: z.enum(['low', 'medium', 'high']).default('medium'),
      verbosity: z.enum(['terse', 'normal', 'chatty']).default('normal'),
      // If true, the no_reply tool (see tools/sessionControl.ts) is never
      // registered -- every action gets a spoken confirmation, even trivial
      // reversible ones, for anyone who finds silence after a command
      // unsettling rather than efficient.
      alwaysConfirm: z.boolean().default(false),
      // Extra greeting lines merged in alongside the built-in ones in
      // llm/greetings.ts, keyed by language code. Doesn't replace the
      // built-ins, just adds more variety (or, in practice, a way to hear
      // your own lines in the rotation).
      extraGreetings: z.record(z.string(), z.array(z.string())).default({}),
      // Agent-loop tuning -- see index.ts.
      maxAgentSteps: z.number().int().min(1).max(20).default(5),
      backgroundThresholdMs: z.number().int().min(200).default(1500),
      maxHistoryMessages: z.number().int().min(4).default(40)
    })
    .default({
      defaultLanguage: 'en',
      wit: 'medium',
      verbosity: 'normal',
      alwaysConfirm: false,
      extraGreetings: {},
      maxAgentSteps: 5,
      backgroundThresholdMs: 1500,
      maxHistoryMessages: 40
    }),
  // Tool names to leave out of the registry entirely (see
  // tools/registry.ts) -- e.g. ["read_webpage"] for privacy, or
  // ["close_app"] for extra caution beyond its existing risky-confirm gate.
  // Typo'd/unknown names are logged at startup rather than silently
  // ignored (see index.ts).
  tools: z
    .object({
      disabled: z.array(z.string()).default([])
    })
    .default({ disabled: [] }),
  // Dev project shortcuts for the open_project tool -- "open acucall" ->
  // launch VS Code / a terminal / Claude Code at a known path, no per-app
  // hardcoding needed like open_app's Start Menu search.
  projects: z
    .array(
      z.object({
        name: z.string().min(1),
        path: z.string().min(1),
        // Editor CLI to launch for the "editor" action (defaults to VS Code's `code`).
        editorCommand: z.string().default('code')
      })
    )
    .default([])
})

export type KiraConfig = z.infer<typeof configSchema>
