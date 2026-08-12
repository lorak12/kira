import { describe, it, expect } from 'vitest'
import { noReplyTool, endConversationTool } from './sessionControl'

// These two are handled specially in index.ts's runAgentStep before the
// generic tool executor ever sees them -- execute() here is a defensive
// fallback, not the real behavior. These tests just pin down the contract
// index.ts relies on: the schema name it switches on, and that neither is
// marked risky (they should never be parked for confirmation).
describe('sessionControl tools', () => {
  it('no_reply is named "no_reply", non-risky, and takes no arguments', () => {
    expect(noReplyTool.schema.name).toBe('no_reply')
    expect(noReplyTool.risky).toBe(false)
    expect(noReplyTool.schema.parameters.required).toEqual([])
  })

  it('end_conversation is named "end_conversation", non-risky, and takes no arguments', () => {
    expect(endConversationTool.schema.name).toBe('end_conversation')
    expect(endConversationTool.risky).toBe(false)
    expect(endConversationTool.schema.parameters.required).toEqual([])
  })

  it('their execute() fallbacks resolve rather than throw, in case one is ever invoked directly', async () => {
    await expect(noReplyTool.execute({})).resolves.toMatch(/silent/i)
    await expect(endConversationTool.execute({})).resolves.toMatch(/ending/i)
  })
})
