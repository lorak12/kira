import { describe, it, expect } from 'vitest'
import { truncateForHistory, trimHistory } from './historyManagement'
import type { ChatMessage } from './LlmEngine'

describe('truncateForHistory', () => {
  it('leaves short text untouched', () => {
    expect(truncateForHistory('Opened Spotify.')).toBe('Opened Spotify.')
  })

  it('truncates long text with an ellipsis', () => {
    const long = 'x'.repeat(3000)
    const result = truncateForHistory(long, 100)
    expect(result.length).toBe(100)
    expect(result.endsWith('…')).toBe(true)
  })
})

describe('trimHistory', () => {
  function userMsg(i: number): ChatMessage {
    return { role: 'user', content: `msg ${i}` }
  }

  it('returns history unchanged when under the cap', () => {
    const history = [userMsg(1), userMsg(2)]
    expect(trimHistory(history, 40)).toBe(history) // same reference, no copy needed
  })

  it('drops the oldest messages first when over the cap', () => {
    const history = Array.from({ length: 10 }, (_, i) => userMsg(i))
    const result = trimHistory(history, 4)
    expect(result).toHaveLength(4)
    expect(result[0].content).toBe('msg 6')
    expect(result[result.length - 1].content).toBe('msg 9')
  })

  it('never leaves an orphaned tool message without its assistant tool_calls message', () => {
    const history: ChatMessage[] = [
      userMsg(0),
      { role: 'assistant', content: '', toolCalls: [{ id: 't1', name: 'x', arguments: {} }] },
      { role: 'tool', content: 'result', toolCallId: 't1', name: 'x' },
      userMsg(3),
      userMsg(4)
    ]
    // Cap forces the cut to land exactly between the assistant/tool pair
    // (drop 2 -> would start right at the 'tool' message at index 2).
    const result = trimHistory(history, 3)
    expect(result[0].role).not.toBe('tool')
    // Confirms it walked forward past the orphan tool message rather than
    // just landing wherever the raw cap said to.
    expect(result.some((m) => m.role === 'tool')).toBe(false)
  })

  it('handles an empty history', () => {
    expect(trimHistory([], 40)).toEqual([])
  })

  it('handles the cap landing exactly on the boundary', () => {
    const history = Array.from({ length: 5 }, (_, i) => userMsg(i))
    expect(trimHistory(history, 5)).toHaveLength(5)
  })
})
