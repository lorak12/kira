import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { configSchema } from './schema'

// Minimal valid config -- only the two fields with no default (they're
// secrets, can't have a sensible one).
function minimalRaw(): Record<string, unknown> {
  return {
    wakeWord: { modelPath: 'resources/models/kira.onnx' },
    sidecar: {},
    stt: {},
    llm: { openRouterApiKey: 'sk-test' },
    tts: {},
    overlay: {},
    hotkeys: {}
  }
}

describe('configSchema', () => {
  it('accepts the minimal required fields and fills in everything else with defaults', () => {
    const config = configSchema.parse(minimalRaw())
    expect(config.assistant.wit).toBe('medium')
    expect(config.assistant.verbosity).toBe('normal')
    expect(config.assistant.alwaysConfirm).toBe(false)
    expect(config.assistant.extraGreetings).toEqual({})
    expect(config.assistant.maxAgentSteps).toBe(5)
    expect(config.assistant.backgroundThresholdMs).toBe(1500)
    expect(config.assistant.maxHistoryMessages).toBe(40)
    expect(config.tools.disabled).toEqual([])
    expect(config.tts.voiceSettings).toBeUndefined()
    expect(config.tts.edge.prosody).toBeUndefined()
  })

  it('rejects a config missing the required LLM API key', () => {
    const result = configSchema.safeParse({ wakeWord: { modelPath: 'x' } })
    expect(result.success).toBe(false)
  })

  it('accepts a fully-specified assistant block', () => {
    const config = configSchema.parse({
      ...minimalRaw(),
      assistant: {
        wit: 'high',
        verbosity: 'terse',
        alwaysConfirm: true,
        extraGreetings: { en: ['Systems nominal.'] },
        maxAgentSteps: 3,
        backgroundThresholdMs: 2000,
        maxHistoryMessages: 20
      }
    })
    expect(config.assistant.wit).toBe('high')
    expect(config.assistant.alwaysConfirm).toBe(true)
    expect(config.assistant.extraGreetings).toEqual({ en: ['Systems nominal.'] })
  })

  it('rejects an out-of-range maxAgentSteps', () => {
    expect(configSchema.safeParse({ ...minimalRaw(), assistant: { maxAgentSteps: 0 } }).success).toBe(false)
    expect(configSchema.safeParse({ ...minimalRaw(), assistant: { maxAgentSteps: 100 } }).success).toBe(false)
  })

  it('accepts tools.disabled as a list of tool names', () => {
    const config = configSchema.parse({ ...minimalRaw(), tools: { disabled: ['read_webpage', 'close_app'] } })
    expect(config.tools.disabled).toEqual(['read_webpage', 'close_app'])
  })

  it('accepts partial voice tuning, leaving unset fields undefined', () => {
    const config = configSchema.parse({
      ...minimalRaw(),
      tts: { voiceSettings: { stability: 0.4 }, edge: { prosody: { rate: '+20%' } } }
    })
    expect(config.tts.voiceSettings).toEqual({ stability: 0.4 })
    expect(config.tts.edge.prosody).toEqual({ rate: '+20%' })
  })

  it('rejects a numeric pitch -- edge prosody pitch is string-only, matching msedge-tts', () => {
    const result = configSchema.safeParse({ ...minimalRaw(), tts: { edge: { prosody: { pitch: 5 } } } })
    expect(result.success).toBe(false)
  })

  it('the shipped kira.config.example.json parses cleanly against the current schema', () => {
    const raw = JSON.parse(readFileSync(join(__dirname, '../../../kira.config.example.json'), 'utf-8'))
    const result = configSchema.safeParse(raw)
    expect(result.success).toBe(true)
  })
})
