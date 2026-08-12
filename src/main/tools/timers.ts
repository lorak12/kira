import { app, Notification } from 'electron'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { ToolDefinition } from './types'

interface TimerEntry {
  id: number
  label: string
  fireAt: number
  handle: ReturnType<typeof setTimeout> | null
}

interface PersistedTimer {
  id: number
  label: string
  fireAt: number
}

const timers = new Map<number, TimerEntry>()
let nextId = 1

// Set once via restoreTimers() at startup (index.ts, before the sidecar
// starts listening) -- lets a timer speak up through the same proactive-
// announcement path a finished background task uses, instead of only a
// silent OS notification nobody may be looking at. Left null in tests/
// KIRA_UI_PREVIEW, where the desktop Notification is the only signal.
// Receives a ready-to-speak phrase, not the raw label -- callers should
// pass it straight to TTS, not reformat it.
let onFireHook: ((phrase: string, id: number) => void) | null = null

function spokenPhraseFor(label: string): string {
  return label ? `Timer's up -- ${label}.` : "Timer's up."
}

function getTimersPath(): string {
  return join(app.getPath('userData'), 'timers.json')
}

function notify(label: string): void {
  if (!Notification.isSupported()) return
  const notification = new Notification({ title: 'Kira', body: label ? `Timer done: ${label}` : 'Timer done' })
  notification.show()
}

async function persist(): Promise<void> {
  const path = getTimersPath()
  const data: PersistedTimer[] = [...timers.values()].map(({ id, label, fireAt }) => ({ id, label, fireAt }))
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(data), 'utf-8')
  } catch (err) {
    // A timer still works for this run even if it can't be saved -- it just
    // won't survive a restart. Not worth surfacing to the user mid-turn.
    console.error('[kira] failed to persist timers:', (err as Error).message)
  }
}

function fire(id: number, label: string): void {
  timers.delete(id)
  notify(label)
  onFireHook?.(spokenPhraseFor(label), id)
  void persist()
}

function schedule(id: number, label: string, fireAt: number): void {
  const remainingMs = Math.max(0, fireAt - Date.now())
  const handle = setTimeout(() => fire(id, label), remainingMs)
  timers.set(id, { id, label, fireAt, handle })
}

/**
 * Restores timers saved by a previous run and registers the hook used to
 * announce one firing (see onFireHook above). Call once at startup, before
 * the sidecar starts -- a timer that already elapsed while the app was
 * closed fires immediately (as a "missed while closed" catch-up) instead of
 * silently vanishing, which is what an in-memory-only timer used to do on
 * every restart.
 */
export async function restoreTimers(onFire: (phrase: string, id: number) => void): Promise<void> {
  onFireHook = onFire
  let saved: PersistedTimer[] = []
  try {
    const raw = await readFile(getTimersPath(), 'utf-8')
    saved = JSON.parse(raw) as PersistedTimer[]
  } catch {
    // No saved timers yet, or the file's corrupt -- start fresh either way.
    return
  }
  if (!Array.isArray(saved) || !saved.length) return
  nextId = saved.reduce((max, t) => Math.max(max, t.id + 1), nextId)
  const now = Date.now()
  for (const t of saved) {
    if (t.fireAt <= now) {
      const missedPhrase = t.label
        ? `Sorry -- I missed this one while I was closed: ${t.label}. It should've gone off a while ago.`
        : "Sorry -- I missed a timer while I was closed. It should've gone off a while ago."
      notify(t.label)
      onFireHook(missedPhrase, t.id)
    } else {
      schedule(t.id, t.label, t.fireAt)
    }
  }
  await persist()
}

/** Clears all active timers -- exported for tests, and doubles as the impl behind "cancel all timers". */
export function resetTimers(): void {
  for (const t of timers.values()) {
    if (t.handle) clearTimeout(t.handle)
  }
  timers.clear()
  nextId = 1
}

export function formatRemaining(fireAt: number, now: number = Date.now()): string {
  const remainingSec = Math.max(0, Math.round((fireAt - now) / 1000))
  if (remainingSec >= 60) {
    const min = Math.floor(remainingSec / 60)
    const sec = remainingSec % 60
    return sec ? `${min}m ${sec}s` : `${min}m`
  }
  return `${remainingSec}s`
}

// setTimeout's delay is a signed 32-bit int internally -- past ~24.8 days
// it silently fires (near-)immediately instead of waiting, so an absolute
// reminder further out than this is refused rather than misfiring. Well
// past any realistic "remind me tomorrow/next week" use.
const MAX_DELAY_MS = 20 * 24 * 60 * 60 * 1000 // 20 days

export const setTimerTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'set_timer',
    description:
      'Sets a timer/reminder that speaks up and notifies the user, either after a given duration or at a specific date/time -- survives an app restart. One tool for both relative ("in 20 minutes") and absolute ("at 9am tomorrow") reminders.',
    parameters: {
      type: 'object',
      properties: {
        seconds: {
          type: 'number',
          description: 'Duration in seconds from now until the timer fires. Use this OR atIso, not both.'
        },
        atIso: {
          type: 'string',
          description:
            'Absolute date-time to fire at, as an ISO 8601 string (e.g. "2026-08-13T09:00:00"). Use this OR seconds, not both. Call get_datetime first if you need today\'s date to compute this from something relative like "tomorrow" or "next Monday".'
        },
        label: { type: 'string', description: 'Optional short label for what the timer is for' }
      },
      required: []
    }
  },
  async execute(args) {
    const label = args.label ? String(args.label) : ''
    let fireAt: number

    if (args.atIso !== undefined) {
      const parsed = Date.parse(String(args.atIso))
      if (Number.isNaN(parsed)) return `"${args.atIso}" isn't a date/time I can understand.`
      if (parsed <= Date.now()) return "That time's already passed -- give me a time in the future."
      fireAt = parsed
    } else {
      const seconds = Number(args.seconds)
      if (!Number.isFinite(seconds) || seconds <= 0) return 'Please give me a positive duration, or a specific date/time.'
      fireAt = Date.now() + seconds * 1000
    }

    if (fireAt - Date.now() > MAX_DELAY_MS) {
      return "That's too far out for me to reliably schedule right now -- closer to 20 days or less, please."
    }

    const id = nextId++
    schedule(id, label, fireAt)
    await persist()
    return `Timer set${label ? ` for "${label}"` : ''}, ${formatRemaining(fireAt)} from now.`
  }
}

export const listTimersTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'list_timers',
    description: 'Lists all currently active timers.',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  async execute() {
    if (!timers.size) return 'No active timers.'
    const entries = [...timers.values()].map(
      (t) => `#${t.id}${t.label ? ` (${t.label})` : ''}: ${formatRemaining(t.fireAt)} left`
    )
    return `Active timers: ${entries.join(', ')}.`
  }
}

export const cancelTimerTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'cancel_timer',
    description: 'Cancels a specific timer by id, or all active timers.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'The timer id to cancel (from list_timers). Omit to cancel all.' }
      },
      required: []
    }
  },
  async execute(args) {
    if (args.id === undefined) {
      const count = timers.size
      resetTimers()
      await persist()
      return count ? `Cancelled ${count} timer(s).` : 'No active timers to cancel.'
    }
    const id = Number(args.id)
    const entry = timers.get(id)
    if (!entry) return `No timer with id ${id}.`
    if (entry.handle) clearTimeout(entry.handle)
    timers.delete(id)
    await persist()
    return `Cancelled timer${entry.label ? ` "${entry.label}"` : ` #${id}`}.`
  }
}
