import { app } from 'electron'
import { appendFile, readFile, writeFile, mkdir } from 'fs/promises'
import { dirname, join } from 'path'

export interface UsageEvent {
  ts: string // ISO
  toolName: string
  category: string
}

export function usageStatsPath(): string {
  return join(app.getPath('userData'), 'usage-stats.jsonl')
}

// Coarse categories only -- never the raw call arguments -- so this
// long-lived log doesn't end up holding search queries, email addresses, or
// other content the user typed. Tool names not listed here fall back to
// 'other' in appendUsageEvent's caller.
export const TOOL_CATEGORY: Record<string, string> = {
  list_calendar_events: 'calendar',
  create_calendar_event: 'calendar',
  update_calendar_event: 'calendar',
  delete_calendar_event: 'calendar',
  search_emails: 'email',
  get_email: 'email',
  send_email: 'email',
  search_drive_files: 'drive',
  get_drive_file_link: 'drive',
  read_google_doc: 'docs',
  create_google_doc: 'docs',
  read_sheet_range: 'sheets',
  append_sheet_row: 'sheets',
  read_slides_outline: 'slides',
  create_slide: 'slides',
  get_directions: 'commute',
  open_app: 'app-launch',
  close_app: 'app-launch',
  open_url: 'browsing',
  web_search: 'browsing',
  media_control: 'media',
  set_volume: 'media',
  add_note: 'notes',
  list_notes: 'notes',
  remember_fact: 'memory',
  open_project: 'dev-project'
}

export function categoryForTool(toolName: string): string {
  return TOOL_CATEGORY[toolName] ?? 'other'
}

export async function appendUsageEvent(event: UsageEvent): Promise<void> {
  const path = usageStatsPath()
  await mkdir(dirname(path), { recursive: true })
  await appendFile(path, `${JSON.stringify(event)}\n`, 'utf-8')
}

/**
 * Reads events, optionally only the last `sinceDays`. Tolerates a corrupt
 * trailing line (e.g. a partial write from a crash) by skipping only that
 * line rather than losing everything before it.
 */
export async function readUsageEvents(sinceDays?: number): Promise<UsageEvent[]> {
  let raw: string
  try {
    raw = await readFile(usageStatsPath(), 'utf-8')
  } catch {
    return []
  }

  const cutoff = sinceDays !== undefined ? Date.now() - sinceDays * 24 * 60 * 60 * 1000 : undefined
  const events: UsageEvent[] = []
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const event = JSON.parse(line) as UsageEvent
      if (cutoff === undefined || new Date(event.ts).getTime() >= cutoff) events.push(event)
    } catch {
      // Corrupt/partial line -- skip it, keep the rest.
    }
  }
  return events
}

export async function pruneUsageLog(maxAgeDays = 90): Promise<void> {
  const events = await readUsageEvents(maxAgeDays)
  await writeFile(usageStatsPath(), events.map((e) => JSON.stringify(e)).join('\n') + (events.length ? '\n' : ''), 'utf-8')
}
