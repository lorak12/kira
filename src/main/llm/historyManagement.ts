import type { ChatMessage } from './LlmEngine'

// A single very chatty tool result (e.g. a big find_files match list) could
// otherwise dominate the context budget on its own -- this caps what
// actually reaches the LLM, independent of the shorter truncate() used for
// the spoken/activity-panel versions of the same result.
const MAX_TOOL_RESULT_CHARS = 2000

/** Caps a tool result before it goes into conversation history sent to the LLM. */
export function truncateForHistory(text: string, max = MAX_TOOL_RESULT_CHARS): string {
  const trimmed = text.trim()
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed
}

// A long single session (many back-and-forth turns without re-waking) would
// otherwise replay its *entire* history on every LLM call forever -- fine
// for a few turns, unbounded cost/context risk for a marathon one.
const DEFAULT_MAX_MESSAGES = 40

/**
 * Keeps only the most recent messages, without ever splitting a `tool`
 * message off from the `assistant` message whose `toolCalls` it answers --
 * OpenAI-style APIs require every tool_call to have a matching response
 * message, and a naive slice can leave an orphaned one right at the cut
 * point. Does not mutate `history`; the full array is still kept for the
 * activity panel/logs, this only bounds what's sent to the LLM.
 */
export function trimHistory(history: ChatMessage[], maxMessages = DEFAULT_MAX_MESSAGES): ChatMessage[] {
  if (history.length <= maxMessages) return history
  const minDrop = history.length - maxMessages
  let start = minDrop
  while (start < history.length && history[start].role === 'tool') {
    start++
  }
  return history.slice(start)
}
