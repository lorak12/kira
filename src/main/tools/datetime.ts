import type { ToolDefinition } from './types'

export class DatetimeError extends Error {}

/**
 * Formats "now" in a given IANA timezone (defaults to the system timezone).
 * Injectable `now` for deterministic tests.
 */
export function formatNow(timezone: string | undefined, now: Date = new Date()): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone || undefined,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    })
    return formatter.format(now)
  } catch {
    throw new DatetimeError(`Unknown timezone "${timezone}".`)
  }
}

/** Adds/subtracts a duration from now, e.g. "in 3 days" or "90 minutes ago". */
export function addDuration(amount: number, unit: string, now: Date = new Date()): Date {
  const ms = durationToMs(amount, unit)
  return new Date(now.getTime() + ms)
}

const UNIT_MS: Record<string, number> = {
  second: 1000,
  seconds: 1000,
  minute: 60_000,
  minutes: 60_000,
  hour: 3_600_000,
  hours: 3_600_000,
  day: 86_400_000,
  days: 86_400_000,
  week: 604_800_000,
  weeks: 604_800_000
}

function durationToMs(amount: number, unit: string): number {
  const factor = UNIT_MS[unit.trim().toLowerCase()]
  if (!factor) throw new DatetimeError(`Unknown duration unit "${unit}".`)
  return amount * factor
}

export const datetimeTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'get_datetime',
    description:
      'Gets the current date and time, optionally in a specific IANA timezone (e.g. "America/New_York", "Europe/Warsaw"). Also does date math: pass amount/unit to get a time offset from now (e.g. "in 3 days", "90 minutes ago" -> amount: -90, unit: "minutes").',
    parameters: {
      type: 'object',
      properties: {
        timezone: {
          type: 'string',
          description: 'IANA timezone name, e.g. "Europe/Warsaw". Omit for the system timezone.'
        },
        amount: {
          type: 'number',
          description: 'Optional offset amount for date math (negative for "ago"). Omit for just the current time.'
        },
        unit: {
          type: 'string',
          description: 'Unit for the offset amount',
          enum: ['seconds', 'minutes', 'hours', 'days', 'weeks']
        }
      },
      required: []
    }
  },
  async execute(args) {
    const timezone = args.timezone ? String(args.timezone) : undefined
    try {
      if (args.amount !== undefined && args.unit) {
        const target = addDuration(Number(args.amount), String(args.unit))
        return formatNow(timezone, target)
      }
      return formatNow(timezone)
    } catch (err) {
      return `Could not get the date/time: ${(err as Error).message}`
    }
  }
}
