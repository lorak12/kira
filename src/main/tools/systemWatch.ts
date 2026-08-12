import type { ToolDefinition } from './types'
import { getBatteryDiskInfo, type BatteryDiskInfo } from './systemStatus'

// Distinct verb from get_system_status ("get" = answer once, "watch" =
// keep checking and speak up later) rather than a second tool that
// overlaps with it -- get_system_status still answers "how's it doing
// right now", this answers "let me know when X happens".
export type WatchMetric = 'battery_percent' | 'disk_free_gb'
export type Comparison = 'below' | 'above'

interface Watch {
  id: number
  metric: WatchMetric
  comparison: Comparison
  threshold: number
  intervalHandle: ReturnType<typeof setInterval>
}

const watches = new Map<number, Watch>()
let nextId = 1

// Set once via initSystemWatch() at startup (index.ts) -- lets a crossed
// threshold speak up through the same proactive-announcement path a fired
// timer uses. Left null in tests, where a triggered watch is observed via
// its side effects (removal from `watches`) instead.
let onTriggerHook: ((phrase: string, id: number) => void) | null = null

// Once a minute is frequent enough to notice a real change (battery
// draining, disk filling up) without it mattering that it's not instant.
const POLL_INTERVAL_MS = 60_000

const METRIC_LABEL: Record<WatchMetric, string> = {
  battery_percent: 'battery',
  disk_free_gb: 'free disk space'
}

function formatValue(metric: WatchMetric, value: number): string {
  return metric === 'battery_percent' ? `${value}%` : `${value} GB`
}

function readMetric(info: BatteryDiskInfo, metric: WatchMetric): number | null {
  return metric === 'battery_percent' ? info.batteryPercent : info.diskFreeGb
}

/** True once `value` has crossed to the wrong side of `threshold` for `comparison`. Pure/testable. */
export function hasCrossed(value: number, comparison: Comparison, threshold: number): boolean {
  return comparison === 'below' ? value < threshold : value > threshold
}

export function initSystemWatch(onTrigger: (phrase: string, id: number) => void): void {
  onTriggerHook = onTrigger
}

/** Clears all active watches -- exported for tests. */
export function resetWatches(): void {
  for (const w of watches.values()) clearInterval(w.intervalHandle)
  watches.clear()
  nextId = 1
}

async function checkWatch(id: number): Promise<void> {
  const watch = watches.get(id)
  if (!watch) return
  let info: BatteryDiskInfo
  try {
    info = await getBatteryDiskInfo()
  } catch {
    return // best-effort, same as get_system_status -- try again next tick
  }
  const value = readMetric(info, watch.metric)
  if (value === null || !hasCrossed(value, watch.comparison, watch.threshold)) return

  clearInterval(watch.intervalHandle)
  watches.delete(id)
  const label = METRIC_LABEL[watch.metric]
  onTriggerHook?.(
    `Heads up -- ${label} just went ${watch.comparison} ${formatValue(watch.metric, watch.threshold)}. It's at ${formatValue(watch.metric, value)} now.`,
    id
  )
}

export const watchSystemMetricTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'watch_system_metric',
    description:
      'Watches battery percent or free disk space (GB) and proactively speaks up ONCE when it crosses a threshold -- e.g. "tell me when the battery drops below 20%" or "let me know if disk space goes below 10GB". Checks roughly once a minute; does not survive an app restart. Different from get_system_status, which only answers when asked.',
    parameters: {
      type: 'object',
      properties: {
        metric: { type: 'string', description: 'Which metric to watch', enum: ['battery_percent', 'disk_free_gb'] },
        comparison: { type: 'string', description: 'Fire when the value goes below or above the threshold', enum: ['below', 'above'] },
        threshold: { type: 'number', description: 'The threshold value (percent for battery, GB for disk)' }
      },
      required: ['metric', 'comparison', 'threshold']
    }
  },
  async execute(args) {
    const metric = String(args.metric ?? '') as WatchMetric
    const comparison = String(args.comparison ?? '') as Comparison
    const threshold = Number(args.threshold)
    if (!(metric in METRIC_LABEL)) return `Unknown metric "${args.metric}".`
    if (comparison !== 'below' && comparison !== 'above') return `Unknown comparison "${args.comparison}".`
    if (!Number.isFinite(threshold)) return `"${args.threshold}" is not a valid number.`

    const id = nextId++
    const intervalHandle = setInterval(() => void checkWatch(id), POLL_INTERVAL_MS)
    watches.set(id, { id, metric, comparison, threshold, intervalHandle })
    void checkWatch(id) // in case it's already past the threshold right now

    return `Watching ${METRIC_LABEL[metric]} -- I'll let you know when it goes ${comparison} ${formatValue(metric, threshold)}.`
  }
}

export const listWatchesTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'list_watches',
    description: 'Lists all currently active system-metric watches (see watch_system_metric).',
    parameters: { type: 'object', properties: {}, required: [] }
  },
  async execute() {
    if (!watches.size) return 'No active watches.'
    const entries = [...watches.values()].map(
      (w) => `#${w.id}: ${METRIC_LABEL[w.metric]} ${w.comparison} ${formatValue(w.metric, w.threshold)}`
    )
    return `Active watches: ${entries.join(', ')}.`
  }
}

export const cancelWatchTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'cancel_watch',
    description: 'Cancels a specific system-metric watch by id, or all active watches.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'The watch id to cancel (from list_watches). Omit to cancel all.' }
      },
      required: []
    }
  },
  async execute(args) {
    if (args.id === undefined) {
      const count = watches.size
      resetWatches()
      return count ? `Cancelled ${count} watch(es).` : 'No active watches to cancel.'
    }
    const id = Number(args.id)
    const entry = watches.get(id)
    if (!entry) return `No watch with id ${id}.`
    clearInterval(entry.intervalHandle)
    watches.delete(id)
    return `Cancelled watch #${id}.`
  }
}
