import { loadMemoryStore, type MemoryEntry, type MemoryCategory } from './store'

const DEFAULT_LIMIT = 6

// Patterns and active projects are what makes Kira feel like she's actually
// paying attention to what the user does -- weighted above one-off facts
// and preferences, which are useful but less distinctive.
const CATEGORY_WEIGHT: Record<MemoryCategory, number> = {
  project: 1.2,
  pattern: 1.1,
  preference: 0.9,
  fact: 0.8
}

/** 1.0 for something reinforced today, decaying toward 0 over ~30 days. Pure/testable. */
export function recencyDecay(ageDays: number): number {
  return Math.exp(-ageDays / 30)
}

/** Case-insensitive word-set overlap (Jaccard-ish), 0-1. Pure/testable. */
export function keywordOverlap(a: string, b: string): number {
  const wordsOf = (s: string): Set<string> => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? [])
  const setA = wordsOf(a)
  const setB = wordsOf(b)
  if (!setA.size || !setB.size) return 0
  let shared = 0
  for (const word of setA) if (setB.has(word)) shared++
  return shared / new Set([...setA, ...setB]).size
}

function scoreEntry(entry: MemoryEntry, now: Date, utteranceHint?: string): number {
  const ageDays = (now.getTime() - new Date(entry.lastConfirmedAt).getTime()) / (1000 * 60 * 60 * 24)
  const base = CATEGORY_WEIGHT[entry.category] * recencyDecay(ageDays) * entry.confidence
  if (!utteranceHint) return base
  return base * (1 + keywordOverlap(entry.text, utteranceHint))
}

/**
 * Builds the system-context blurb pushed once per fresh session (see
 * index.ts's wake handler), or null if there's nothing to say -- same shape
 * as tools/notes.ts's buildRecentNotesContext, pushed alongside it rather
 * than replacing it (notes are explicit/verbatim, this is curated/durable --
 * see memory/store.ts's doc comment for the distinction). No embeddings: an
 * optional utteranceHint just re-ranks by keyword overlap, since there's
 * usually no utterance yet at wake time -- see Open Questions in the plan.
 */
export async function buildMemoryContext(limit = DEFAULT_LIMIT, utteranceHint?: string, now: Date = new Date()): Promise<string | null> {
  const store = await loadMemoryStore()
  if (!store.entries.length) return null

  const top = [...store.entries]
    .sort((a, b) => scoreEntry(b, now, utteranceHint) - scoreEntry(a, now, utteranceHint))
    .slice(0, limit)
  if (!top.length) return null

  return `Background on what the user's been doing/prefers, for context only -- bring it up if relevant, don't recite it unprompted: ${top.map((e) => e.text).join('; ')}.`
}
