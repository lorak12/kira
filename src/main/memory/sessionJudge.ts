import type { LlmEngine, ChatMessage } from '../llm/LlmEngine'
import { loadMemoryStore, saveMemoryStore, upsertEntry, type MemoryCategory, type MemoryEntry } from './store'

export interface SessionJudgeInput {
  transcriptSummary: string
  toolCallLog: { name: string; category: string }[]
}

export interface SessionJudgeUpsert {
  category: MemoryCategory
  text: string
  matchId?: string
}

export interface SessionJudgeResult {
  worthPersisting: boolean
  upserts: SessionJudgeUpsert[]
}

const VALID_CATEGORIES: MemoryCategory[] = ['project', 'preference', 'pattern', 'fact']

function judgePrompt(input: SessionJudgeInput, existingEntries: MemoryEntry[]): string {
  const toolLine = input.toolCallLog.length
    ? `Tools called this session (by category): ${input.toolCallLog.map((t) => t.category).join(', ')}.`
    : 'No tools were called this session.'
  const existingLine = existingEntries.length
    ? `Existing relevant memory entries (use their "id" as matchId to update/merge instead of duplicating):\n${existingEntries
        .map((e) => `- id=${e.id} [${e.category}] ${e.text}`)
        .join('\n')}`
    : 'No existing relevant memory entries.'

  return `You are a background judge deciding whether a just-ended conversation with a voice assistant contains anything worth remembering long-term.

Reject (worthPersisting: false) any session that's purely trivial device control -- switching music, adjusting volume, opening/closing an app, opening a URL -- with nothing durable in it. Only accept sessions that reveal an ongoing project/task, a standing preference, or a fact worth recalling weeks from now.

${toolLine}

${existingLine}

Conversation summary:
${input.transcriptSummary}

Respond with ONLY a JSON object, no other text, in this exact shape:
{"worthPersisting": boolean, "upserts": [{"category": "project"|"preference"|"pattern"|"fact", "text": "...", "matchId": "optional existing id"}]}
If worthPersisting is false, upserts must be an empty array.`
}

function parseJudgeResponse(raw: string): SessionJudgeResult {
  try {
    const parsed = JSON.parse(raw) as Partial<SessionJudgeResult>
    if (typeof parsed.worthPersisting !== 'boolean' || !Array.isArray(parsed.upserts)) {
      return { worthPersisting: false, upserts: [] }
    }
    const upserts = parsed.upserts
      .filter((u): u is SessionJudgeUpsert => !!u && typeof u.text === 'string' && VALID_CATEGORIES.includes(u.category as MemoryCategory))
      .map((u) => ({ category: u.category, text: u.text, matchId: typeof u.matchId === 'string' ? u.matchId : undefined }))
    return { worthPersisting: parsed.worthPersisting && upserts.length > 0, upserts }
  } catch {
    return { worthPersisting: false, upserts: [] }
  }
}

/**
 * Runs a single raw LLM call (no tools, not buildSystemPrompt -- this is a
 * judge, not Kira-in-character) to decide whether a session is worth
 * persisting and, if so, extract/merge memory entries. Never throws --
 * any malformed response or LLM failure resolves to "not worth persisting"
 * rather than corrupting memory or crashing the caller.
 */
export async function judgeSession(llmEngine: LlmEngine, input: SessionJudgeInput, existingEntries: MemoryEntry[]): Promise<SessionJudgeResult> {
  try {
    const response = await llmEngine.chat([{ role: 'user', content: judgePrompt(input, existingEntries) }], [])
    if (response.type !== 'text') return { worthPersisting: false, upserts: [] }
    return parseJudgeResponse(response.content)
  } catch {
    return { worthPersisting: false, upserts: [] }
  }
}

/** Condenses a session's history into a plain-text transcript for the judge prompt. Pure/testable. */
export function summarizeTranscript(history: ChatMessage[]): string {
  return history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim())
    .map((m) => `${m.role === 'user' ? 'User' : 'Kira'}: ${m.content}`)
    .join('\n')
}

/**
 * Orchestrates the whole end-of-session flow: summarize, judge, and (if
 * worth it) persist upserts to the memory store. Never throws -- errors are
 * logged by the caller (see index.ts's fire-and-forget call), everything
 * inside here that can fail either has its own fallback or is wrapped.
 */
export async function runSessionJudgeAndPersist(llmEngine: LlmEngine, history: ChatMessage[], toolCallLog: { name: string; category: string }[]): Promise<void> {
  const transcriptSummary = summarizeTranscript(history)
  if (!transcriptSummary.trim()) return

  const store = await loadMemoryStore()
  const result = await judgeSession(llmEngine, { transcriptSummary, toolCallLog }, store.entries)
  if (!result.worthPersisting || !result.upserts.length) return

  let updated = store
  for (const upsert of result.upserts) {
    updated = upsertEntry(updated, { category: upsert.category, text: upsert.text, confidence: 0.6, sourceCount: 1 }, upsert.matchId)
  }
  await saveMemoryStore(updated)
}
