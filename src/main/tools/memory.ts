import type { ToolDefinition } from './types'
import { loadMemoryStore, saveMemoryStore, upsertEntry, type MemoryCategory } from '../memory/store'
import { keywordOverlap } from '../memory/retrieval'

const CATEGORIES: MemoryCategory[] = ['project', 'preference', 'pattern', 'fact']

// Above this overlap with an existing same-category entry, treat it as a
// reinforcement/update of that entry rather than a new one -- naive but
// good enough for an explicit single-fact call (the LLM already decided
// this is worth remembering; it doesn't need a second LLM call just to
// dedup it, unlike the session judge's cross-session merge -- see
// memory/sessionJudge.ts).
const DEDUP_THRESHOLD = 0.5

export const rememberFactTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'remember_fact',
    description:
      'Saves a durable, significant fact about the user for future sessions -- an ongoing project, a standing preference, or something worth recalling weeks from now. NOT for trivial or one-off requests (switching a song, opening an app, a passing comment) -- for those, do nothing. For something the user explicitly wants written down verbatim, use add_note instead.',
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'What kind of memory this is', enum: CATEGORIES },
        text: { type: 'string', description: 'The durable fact, phrased plainly, e.g. "Working on the Acucall project"' }
      },
      required: ['category', 'text']
    }
  },
  async execute(args) {
    const text = String(args.text ?? '').trim()
    if (!text) return "There's nothing to remember there."
    const category = CATEGORIES.includes(args.category as MemoryCategory) ? (args.category as MemoryCategory) : 'fact'

    try {
      const store = await loadMemoryStore()
      const match = store.entries.find((e) => e.category === category && keywordOverlap(e.text, text) > DEDUP_THRESHOLD)
      const updated = upsertEntry(store, { category, text, confidence: 1, sourceCount: 1 }, match?.id)
      await saveMemoryStore(updated)
      return "Got it, I'll remember that."
    } catch (err) {
      return `Couldn't save that: ${(err as Error).message}`
    }
  }
}
