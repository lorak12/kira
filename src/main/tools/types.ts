import type { ToolSchema } from '../llm/LlmEngine'

export interface ToolDefinition {
  schema: ToolSchema
  // Reserved for future tools that need voice confirmation before running
  // (terminal commands, clicking unknown UI elements) -- none of the current
  // tools are destructive/hard-to-reverse enough to need it.
  risky: boolean
  // `signal` is best-effort: it's aborted if the tool's turn/session ends
  // while it's still running (see index.ts's runAgentStep and
  // llm/backgroundTasks.ts). Tools built on fetchJson (http.ts) get real
  // cancellation for free by forwarding it; tools that ignore it just keep
  // running to completion with their result discarded, same as before.
  execute(args: Record<string, unknown>, signal?: AbortSignal): Promise<string>
}
