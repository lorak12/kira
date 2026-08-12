import type { ToolDefinition } from '../tools/types'

// Every real tool today is sub-second, so nothing would ever actually cross
// BACKGROUND_THRESHOLD_MS (index.ts) on its own -- this stands in for a
// genuinely slow one (deep research, a big migration, ...) purely so the
// simulation in scenario.ts has something real to background, report a
// live status on, finish unprompted, and (in the demo's second act) get
// killed by end_conversation. Only registered when KIRA_SIM=1 (see
// tools/registry.ts).
const RESEARCH_DELAY_MS = 12_000

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('cancelled'))
    })
  })
}

export const researchProjectTool: ToolDefinition = {
  risky: false,
  schema: {
    name: 'research_project',
    description:
      "Does deep research and feasibility thinking on a project idea the user describes -- looks into whether it's realistic, what it would take, and comes back with a real assessment. Use this for open-ended \"look into / think about whether X is possible\" requests, not simple lookups.",
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'What to research or assess' }
      },
      required: ['topic']
    }
  },
  async execute(args, signal) {
    const topic = String(args.topic ?? 'the project')
    console.log(`[kira-sim] research_project("${topic}") started -- simulating ~${RESEARCH_DELAY_MS / 1000}s of real work`)
    await delay(RESEARCH_DELAY_MS, signal)
    console.log(`[kira-sim] research_project("${topic}") finished`)
    return `Feasibility check on "${topic}": technically doable -- the core logic can reuse most of what's already in the codebase, so the main new work is a thin new layer on top rather than a rebuild. Biggest risk is scope creep, not feasibility. Worth starting with a stripped-down version to validate the idea before going all in.`
  }
}
