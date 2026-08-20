import type { ToolDefinition } from './types'
import type { GoogleAuthManager } from '../google/authManager'
import { googleFetchJson } from '../google/http'
import { runGoogleTool } from './googleErrors'

const CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

interface CalendarEvent {
  id: string
  summary?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
}

interface CalendarEventList {
  items?: CalendarEvent[]
}

/** Formats one event as a spoken-friendly fragment, e.g. "Standup at 9:00 AM". Pure/testable. */
export function formatEventLine(event: CalendarEvent): string {
  const when = event.start?.dateTime ?? event.start?.date
  const time = when
    ? new Date(when).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
    : 'no time set'
  return `${event.summary ?? '(untitled)'} at ${time}`
}

export function createGoogleCalendarTools(auth: GoogleAuthManager): ToolDefinition[] {
  const listEventsTool: ToolDefinition = {
    risky: false,
    schema: {
      name: 'list_calendar_events',
      description: "Lists the user's upcoming Google Calendar events, optionally within a time range or matching a search query.",
      parameters: {
        type: 'object',
        properties: {
          timeMin: { type: 'string', description: 'ISO 8601 start of range (default: now)' },
          timeMax: { type: 'string', description: 'ISO 8601 end of range (default: unbounded)' },
          query: { type: 'string', description: 'Free-text search against event titles/descriptions' },
          maxResults: { type: 'number', description: 'Max events to return (default 10)' }
        },
        required: []
      }
    },
    async execute(args, signal) {
      return runGoogleTool(async () => {
        const params = new URLSearchParams({
          singleEvents: 'true',
          orderBy: 'startTime',
          timeMin: String(args.timeMin ?? new Date().toISOString()),
          maxResults: String(Number.isFinite(Number(args.maxResults)) ? Number(args.maxResults) : 10)
        })
        if (args.timeMax) params.set('timeMax', String(args.timeMax))
        if (args.query) params.set('q', String(args.query))

        const result = await googleFetchJson<CalendarEventList>(`${CALENDAR_BASE}?${params}`, auth, undefined, signal)
        const items = result.items ?? []
        if (!items.length) return "You don't have any matching events."
        return `Upcoming events: ${items.map(formatEventLine).join('; ')}.`
      })
    }
  }

  const createEventTool: ToolDefinition = {
    risky: true,
    schema: {
      name: 'create_calendar_event',
      description: 'Creates a new Google Calendar event.',
      parameters: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Event title' },
          startIso: { type: 'string', description: 'ISO 8601 start date/time' },
          endIso: { type: 'string', description: 'ISO 8601 end date/time' },
          description: { type: 'string', description: 'Optional event description' }
        },
        required: ['summary', 'startIso', 'endIso']
      }
    },
    async execute(args, signal) {
      return runGoogleTool(async () => {
        const body = {
          summary: String(args.summary ?? ''),
          description: args.description ? String(args.description) : undefined,
          start: { dateTime: String(args.startIso ?? '') },
          end: { dateTime: String(args.endIso ?? '') }
        }
        const created = await googleFetchJson<CalendarEvent>(
          CALENDAR_BASE,
          auth,
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
          signal
        )
        return `Created "${created.summary}".`
      })
    }
  }

  const updateEventTool: ToolDefinition = {
    risky: true,
    schema: {
      name: 'update_calendar_event',
      description: "Updates an existing Google Calendar event's title and/or time.",
      parameters: {
        type: 'object',
        properties: {
          eventId: { type: 'string', description: 'The event ID to update (from list_calendar_events)' },
          summary: { type: 'string', description: 'New title (optional)' },
          startIso: { type: 'string', description: 'New ISO 8601 start (optional)' },
          endIso: { type: 'string', description: 'New ISO 8601 end (optional)' }
        },
        required: ['eventId']
      }
    },
    async execute(args, signal) {
      return runGoogleTool(async () => {
        const eventId = String(args.eventId ?? '')
        const body: Record<string, unknown> = {}
        if (args.summary) body.summary = String(args.summary)
        if (args.startIso) body.start = { dateTime: String(args.startIso) }
        if (args.endIso) body.end = { dateTime: String(args.endIso) }

        const updated = await googleFetchJson<CalendarEvent>(
          `${CALENDAR_BASE}/${encodeURIComponent(eventId)}`,
          auth,
          { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
          signal
        )
        return `Updated "${updated.summary}".`
      })
    }
  }

  const deleteEventTool: ToolDefinition = {
    risky: true,
    schema: {
      name: 'delete_calendar_event',
      description: 'Deletes a Google Calendar event.',
      parameters: {
        type: 'object',
        properties: {
          eventId: { type: 'string', description: 'The event ID to delete (from list_calendar_events)' }
        },
        required: ['eventId']
      }
    },
    async execute(args, signal) {
      return runGoogleTool(async () => {
        const eventId = String(args.eventId ?? '')
        await googleFetchJson<void>(`${CALENDAR_BASE}/${encodeURIComponent(eventId)}`, auth, { method: 'DELETE' }, signal)
        return 'Event deleted.'
      })
    }
  }

  return [listEventsTool, createEventTool, updateEventTool, deleteEventTool]
}
