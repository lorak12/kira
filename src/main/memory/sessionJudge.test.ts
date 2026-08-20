import { describe, it, expect, vi } from 'vitest'
import { readFile, writeFile } from 'fs/promises'
import { judgeSession, summarizeTranscript, runSessionJudgeAndPersist } from './sessionJudge'
import type { LlmEngine, LlmResponse } from '../llm/LlmEngine'
import type { MemoryEntry } from './store'

vi.mock('fs/promises', () => ({
  readFile: vi.fn(async () => '{"entries":[]}'),
  writeFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined)
}))

function fakeEngine(responseText: string): LlmEngine {
  const response: LlmResponse = { type: 'text', content: responseText }
  return { chat: vi.fn(async () => response) }
}

describe('summarizeTranscript', () => {
  it('formats user/assistant turns, skipping empty assistant content and tool messages', () => {
    const summary = summarizeTranscript([
      { role: 'user', content: 'switch to the next song' },
      { role: 'assistant', content: '', toolCalls: [{ id: '1', name: 'media_control', arguments: {} }] },
      { role: 'tool', content: 'Skipped.', toolCallId: '1', name: 'media_control' },
      { role: 'assistant', content: 'Done.' }
    ])
    expect(summary).toBe('User: switch to the next song\nKira: Done.')
  })
})

describe('judgeSession', () => {
  it('rejects a trivial session per the LLM response', async () => {
    const engine = fakeEngine(JSON.stringify({ worthPersisting: false, upserts: [] }))
    const result = await judgeSession(engine, { transcriptSummary: 'User: skip this song', toolCallLog: [{ name: 'media_control', category: 'media' }] }, [])
    expect(result.worthPersisting).toBe(false)
  })

  it('extracts upserts for a session worth persisting', async () => {
    const engine = fakeEngine(
      JSON.stringify({ worthPersisting: true, upserts: [{ category: 'project', text: 'Working on Acucall' }] })
    )
    const result = await judgeSession(engine, { transcriptSummary: 'x', toolCallLog: [] }, [])
    expect(result.worthPersisting).toBe(true)
    expect(result.upserts).toEqual([{ category: 'project', text: 'Working on Acucall', matchId: undefined }])
  })

  it('falls back to not-worth-persisting on malformed JSON rather than throwing', async () => {
    const engine = fakeEngine('not json at all')
    const result = await judgeSession(engine, { transcriptSummary: 'x', toolCallLog: [] }, [])
    expect(result).toEqual({ worthPersisting: false, upserts: [] })
  })

  it('falls back to not-worth-persisting if the LLM call itself throws', async () => {
    const engine: LlmEngine = { chat: vi.fn(async () => { throw new Error('network down') }) }
    const result = await judgeSession(engine, { transcriptSummary: 'x', toolCallLog: [] }, [])
    expect(result).toEqual({ worthPersisting: false, upserts: [] })
  })

  it('drops an upsert with an invalid category rather than crashing', async () => {
    const engine = fakeEngine(JSON.stringify({ worthPersisting: true, upserts: [{ category: 'nonsense', text: 'x' }] }))
    const result = await judgeSession(engine, { transcriptSummary: 'x', toolCallLog: [] }, [])
    expect(result.worthPersisting).toBe(false)
    expect(result.upserts).toEqual([])
  })

  it('includes existing entries in the prompt so the judge can supply a matchId', async () => {
    const engine = fakeEngine(JSON.stringify({ worthPersisting: false, upserts: [] }))
    const existing: MemoryEntry[] = [
      { id: 'a1', category: 'project', text: 'Working on Acucall', createdAt: '', lastConfirmedAt: '', confidence: 1, sourceCount: 1 }
    ]
    await judgeSession(engine, { transcriptSummary: 'x', toolCallLog: [] }, existing)
    const promptArg = vi.mocked(engine.chat).mock.calls[0][0][0].content
    expect(promptArg).toContain('id=a1')
    expect(promptArg).toContain('Working on Acucall')
  })
})

describe('runSessionJudgeAndPersist', () => {
  it('does nothing for an empty/no-content history', async () => {
    const engine = fakeEngine(JSON.stringify({ worthPersisting: true, upserts: [{ category: 'fact', text: 'x' }] }))
    await runSessionJudgeAndPersist(engine, [], [])
    expect(engine.chat).not.toHaveBeenCalled()
    expect(writeFile).not.toHaveBeenCalled()
  })

  it('persists upserts when the judge says worth it', async () => {
    vi.mocked(readFile).mockResolvedValueOnce('{"entries":[]}')
    const engine = fakeEngine(JSON.stringify({ worthPersisting: true, upserts: [{ category: 'project', text: 'Working on Acucall' }] }))
    await runSessionJudgeAndPersist(engine, [{ role: 'user', content: 'I started a new project called Acucall' }], [])
    expect(writeFile).toHaveBeenCalled()
    const written = JSON.parse((vi.mocked(writeFile).mock.calls[0][1] as string))
    expect(written.entries[0].text).toBe('Working on Acucall')
  })

  it('does not write anything when the judge says not worth it', async () => {
    vi.mocked(readFile).mockResolvedValueOnce('{"entries":[]}')
    const engine = fakeEngine(JSON.stringify({ worthPersisting: false, upserts: [] }))
    await runSessionJudgeAndPersist(engine, [{ role: 'user', content: 'skip this song' }], [{ name: 'media_control', category: 'media' }])
    expect(writeFile).not.toHaveBeenCalled()
  })
})
