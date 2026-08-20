import type { LlmEngine } from '../llm/LlmEngine'
import { readUsageEvents, type UsageEvent } from './usageStats'
import { loadMemoryStore, saveMemoryStore, upsertEntry, type MemoryEntry } from './store'

const LOOKBACK_DAYS = 60
// A category/day-of-week/hour-bucket combination needs at least this many
// occurrences before it's even offered to the LLM as a candidate pattern --
// the statistical grouping/thresholding is done in plain code (LLMs are
// unreliable at counting), the LLM's job is only to phrase the strongest
// candidates and decide which are actually interesting.
const MIN_OCCURRENCES = 3
const MAX_CANDIDATES = 5

export interface PatternCandidate {
  category: string
  dayBucket: 'weekday' | 'weekend'
  hourBucket: string // e.g. "7:00-9:00"
  count: number
}

function hourBucketLabel(hour: number): string {
  const start = Math.floor(hour / 2) * 2
  return `${start}:00-${start + 2}:00`
}

/** Groups usage events by category + weekday/weekend + 2-hour bucket. Pure/testable. */
export function groupUsageEvents(events: UsageEvent[]): PatternCandidate[] {
  const counts = new Map<string, PatternCandidate>()
  for (const event of events) {
    const date = new Date(event.ts)
    const day = date.getDay()
    const dayBucket: PatternCandidate['dayBucket'] = day === 0 || day === 6 ? 'weekend' : 'weekday'
    const hourBucket = hourBucketLabel(date.getHours())
    const key = `${event.category}|${dayBucket}|${hourBucket}`
    const existing = counts.get(key)
    if (existing) {
      existing.count++
    } else {
      counts.set(key, { category: event.category, dayBucket, hourBucket, count: 1 })
    }
  }
  return [...counts.values()]
    .filter((c) => c.count >= MIN_OCCURRENCES)
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_CANDIDATES)
}

function reflectionPrompt(candidates: PatternCandidate[], existingPatterns: MemoryEntry[]): string {
  const candidateLines = candidates
    .map((c) => `- ${c.category}, ${c.dayBucket}s around ${c.hourBucket}: seen ${c.count} times in the last ${LOOKBACK_DAYS} days`)
    .join('\n')
  const existingLines = existingPatterns.length
    ? `Existing pattern memory entries (use their "id" as matchId to update instead of duplicating):\n${existingPatterns
        .map((e) => `- id=${e.id} ${e.text}`)
        .join('\n')}`
    : 'No existing pattern memory entries.'

  return `You help a voice assistant notice recurring habits from raw usage statistics, so it can phrase the genuinely interesting ones as natural-language memories.

Candidate recurring usage patterns (already statistically filtered -- these are real repeated occurrences, not one-offs):
${candidateLines}

${existingLines}

Pick 0-3 of the candidates that are actually worth remembering as a habit (skip ones too generic to be useful, e.g. vague "app-launch" clusters), and phrase each as a short natural-language statement, e.g. "Usually asks for directions to the office on weekday mornings." Respond with ONLY a JSON object, no other text:
{"patterns": [{"text": "...", "matchId": "optional existing id"}]}`
}

function parseReflectionResponse(raw: string): Array<{ text: string; matchId?: string }> {
  try {
    const parsed = JSON.parse(raw) as { patterns?: unknown }
    if (!Array.isArray(parsed.patterns)) return []
    return parsed.patterns
      .filter((p): p is { text: string; matchId?: string } => !!p && typeof (p as { text?: unknown }).text === 'string')
      .map((p) => ({ text: p.text, matchId: typeof p.matchId === 'string' ? p.matchId : undefined }))
  } catch {
    return []
  }
}

/**
 * Reads recent usage stats, groups them into candidate recurring patterns in
 * plain code, then asks a cheap LLM call to phrase the interesting ones as
 * `pattern`-category memory entries, merging against existing pattern
 * entries the same matchId way the session judge does. Never throws.
 */
export async function runPatternReflection(llmEngine: LlmEngine): Promise<void> {
  try {
    const events = await readUsageEvents(LOOKBACK_DAYS)
    const candidates = groupUsageEvents(events)
    if (!candidates.length) return

    const store = await loadMemoryStore()
    const existingPatterns = store.entries.filter((e) => e.category === 'pattern')

    const response = await llmEngine.chat([{ role: 'user', content: reflectionPrompt(candidates, existingPatterns) }], [])
    if (response.type !== 'text') return
    const patterns = parseReflectionResponse(response.content)
    if (!patterns.length) return

    let updated = store
    for (const pattern of patterns) {
      updated = upsertEntry(updated, { category: 'pattern', text: pattern.text, confidence: 0.5, sourceCount: 1 }, pattern.matchId)
    }
    await saveMemoryStore(updated)
  } catch {
    // Best-effort background pass -- never let it crash the caller.
  }
}
