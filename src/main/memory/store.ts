import { app } from 'electron'
import { readFile, writeFile, mkdir, rename } from 'fs/promises'
import { dirname, join } from 'path'
import { randomUUID } from 'crypto'

export type MemoryCategory = 'project' | 'preference' | 'pattern' | 'fact'

export interface MemoryEntry {
  id: string
  category: MemoryCategory
  text: string
  createdAt: string // ISO
  lastConfirmedAt: string // ISO, bumped on every merge/reinforcement
  confidence: number // 0-1
  sourceCount: number // how many sessions/observations contributed
}

export interface MemoryStore {
  entries: MemoryEntry[]
}

export function memoryStorePath(): string {
  return join(app.getPath('userData'), 'memory.json')
}

const EMPTY_STORE: MemoryStore = { entries: [] }

export async function loadMemoryStore(): Promise<MemoryStore> {
  try {
    const raw = await readFile(memoryStorePath(), 'utf-8')
    const parsed = JSON.parse(raw) as MemoryStore
    if (!Array.isArray(parsed.entries)) return { entries: [] }
    return parsed
  } catch {
    return EMPTY_STORE
  }
}

/**
 * Writes via a tmp-file + rename so a crash mid-write can't leave memory.json
 * truncated/corrupt -- unlike notes.md's append-only writes, this file needs
 * a full read-modify-write on every upsert, so atomicity actually matters
 * here.
 */
export async function saveMemoryStore(store: MemoryStore): Promise<void> {
  const path = memoryStorePath()
  await mkdir(dirname(path), { recursive: true })
  const tmpPath = `${path}.tmp`
  await writeFile(tmpPath, JSON.stringify(store, null, 2), 'utf-8')
  await rename(tmpPath, path)
}

/**
 * Appends a new entry, or -- if matchId names an existing entry -- merges
 * into it (replaces its text, bumps lastConfirmedAt, increments
 * sourceCount) instead of duplicating. Pure/testable (takes `now` as a
 * parameter rather than reading the clock itself).
 */
export function upsertEntry(
  store: MemoryStore,
  entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'lastConfirmedAt'>,
  matchId?: string,
  now: Date = new Date()
): MemoryStore {
  const nowIso = now.toISOString()

  if (matchId) {
    const existing = store.entries.find((e) => e.id === matchId)
    if (existing) {
      return {
        entries: store.entries.map((e) =>
          e.id === matchId
            ? { ...e, text: entry.text, category: entry.category, confidence: entry.confidence, lastConfirmedAt: nowIso, sourceCount: e.sourceCount + 1 }
            : e
        )
      }
    }
  }

  const newEntry: MemoryEntry = {
    ...entry,
    id: randomUUID().slice(0, 8),
    createdAt: nowIso,
    lastConfirmedAt: nowIso
  }
  return { entries: [...store.entries, newEntry] }
}

const DEFAULT_MAX_AGE_DAYS: Record<MemoryCategory, number> = {
  project: 30,
  pattern: 60,
  preference: 180,
  fact: 365
}

/** Drops entries whose lastConfirmedAt is older than their category's max age. Pure/testable. */
export function pruneStale(store: MemoryStore, now: Date = new Date(), maxAgeDays: Record<MemoryCategory, number> = DEFAULT_MAX_AGE_DAYS): MemoryStore {
  const nowMs = now.getTime()
  return {
    entries: store.entries.filter((e) => {
      const ageDays = (nowMs - new Date(e.lastConfirmedAt).getTime()) / (1000 * 60 * 60 * 24)
      return ageDays <= maxAgeDays[e.category]
    })
  }
}
